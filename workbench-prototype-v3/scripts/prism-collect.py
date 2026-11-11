"""Local collection adapter. Only emit aggregate receipts, never credentials or text."""
import contextlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRISM = ROOT.parent / "Prism"
ROOTS = {"color": "UdaRwddvGiYT1vkIUaCc2PW6nIh", "sketch": "XwMrwxiLSid1pok6qh4cjhT9nsd", "quick": "DGXjw31NIiBEZnkPB3hcTfkjnIc"}


def emit(**data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def partial_message(fields):
    """扫描未完成与待补项要分开说，不能合成一句“部分媒体未下载”。"""
    parts = []
    if not fields.get("scan_complete", True):
        rooms = fields.get("scan_incomplete_rooms") or []
        parts.append("扫描范围未覆盖 " + ("、".join(rooms) if rooms else "部分群"))
    failed = fields.get("failed_items") or 0
    if failed:
        by_stage = fields.get("failed_by_stage") or {}
        detail = " / ".join(f"{key} {value}" for key, value in by_stage.items() if value)
        parts.append(f"{failed} 项未完成" + (f"（{detail}）" if detail else ""))
    pending = fields.get("pending_after")
    if isinstance(pending, int) and pending:
        parts.append(f"本次范围待补 {pending} 项，下次运行会回看")
    others = fields.get("pending_out_of_scope")
    if isinstance(others, int) and others:
        parts.append(f"其他群另欠 {others} 项")
    return "；".join(parts) + "；已下载资料保留" if parts else "部分完成，已下载资料保留"



def main():
    request = json.load(sys.stdin)
    if request["kind"] == "images":
        sys.path.insert(0, str(ROOT / "project/modules/jiaoyan-qun-archive/src"))
        from jyq.room_fetch import run_room_fetch
        from jyq.status import workbench_status
        emit(stage="正在查询白名单教研群并下载新增图片")
        with contextlib.redirect_stdout(io.StringIO()):
            result = run_room_fetch(all_whitelist=True, since=request.get("since"))
        fields = result.machine_fields
        counts = {key: value for key, value in fields.items() if isinstance(value, int) and not isinstance(value, bool)}
        status = workbench_status(result.status)
        message = {
            "complete": "采集完成",
            "partial": partial_message(fields),
            "failed": "采集失败，请检查方舟连接、登录状态与媒体下载通道",
        }.get(status, "采集结果待核对")
        emit(done=True, status=status, counts=counts, runId=result.run_id,
             exitCode=result.exit_code, scanComplete=bool(fields.get("scan_complete")),
             failedItems=int(fields.get("failed_items") or 0),
             pending=int(fields.get("pending_after") or 0),
             pendingOthers=int(fields.get("pending_out_of_scope") or 0),
             scope=fields.get("scope"),
             rooms=fields.get("rooms"),
             window=fields.get("window"),
             windowFromPending=bool(fields.get("window_from_pending")),
             resumeReason=fields.get("resume_reason") or "",
             message=message)
        return
    output = Path(request["output"])
    args = [sys.executable, str(PRISM / "scripts/export_feishu_wiki.py"), "--credentials", str(PRISM / "config/.env"), "--output", str(output)]
    for subject in request["subjects"]:
        args.extend(["--root", ROOTS[subject]])
    emit(stage="正在读取科目目录并下载文档与图片")
    child = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
    for line in child.stdout:
        if line.startswith("progress documents="):
            progress = re.search(r"documents=(\d+)/(\d+) errors=(\d+)", line)
            if progress:
                done, total, errors = progress.groups()
                emit(stage=f"已处理 {done}/{total} 个目录节点 · {errors} 项下载问题")
    code = child.wait()
    manifest_path = output / "manifest.json"
    if not manifest_path.exists():
        emit(done=True, status="failed", message="飞书下载未开始，请检查应用凭据、目录权限与网络")
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    emit(stage="正在整理已下载笔记")
    normalized = subprocess.run([sys.executable, str(PRISM / "scripts/normalize_feishu_export.py"), "--snapshot", str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
    counts = manifest.get("stats", {})
    status = "complete" if code == 0 and normalized == 0 and manifest.get("status") == "complete" else "partial" if counts.get("documentsExported", 0) else "failed"
    quota = any(e.get("apiCode") == 99991403 for e in manifest.get("errors", []))
    emit(done=True, status=status, counts=manifest.get("stats", {}),
         message="飞书本月 API 额度已用尽；已下载资料保留，额度恢复后再下载" if quota else "下载与结构化完成" if status == "complete" else "部分完成，请查看归档中的失败项；已下载资料保留" if status == "partial" else "下载失败，请查看归档中的失败项")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit(done=True, status="failed", message="采集执行失败：" + type(exc).__name__)
