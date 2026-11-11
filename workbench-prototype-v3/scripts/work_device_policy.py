"""Work-client incompatibilities confirmed by the owner, not inferred from timeouts."""
import json
from pathlib import Path

def upgrade_block(device):
    if device.get('softwareVersion') == '1.0.0.703':
        return 'work_client_upgrade_required'
    return None

def team_authorization():
    path = Path(__file__).resolve().parents[2] / 'project/modules/qm-sales-assistant/private/deployment-transfer/device-download/first-phone-test.sasalele-device.json'
    try:
        config = json.loads(path.read_text(encoding='utf-8-sig'))
        expiry = config.get('expires_epoch')
        if not isinstance(expiry, (float, int)) or isinstance(expiry, bool) or expiry <= 0:
            raise ValueError('invalid_expiry')
        return {'expiresEpoch': expiry, 'source': 'team_configuration_file'}
    except (OSError, ValueError):
        return {'expiresEpoch': None, 'source': 'unavailable'}
