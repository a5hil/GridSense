import urllib.request
import json

try:
    with urllib.request.urlopen('http://localhost:3000/api/telemetry', timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        print("=== CURRENT TELEMETRY SNAPSHOT ===")
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error fetching telemetry: {e}")
