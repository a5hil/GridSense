import urllib.request
import json
import time

# 1. Check ports endpoint
print("--- 1. Querying /api/telemetry/ports ---")
try:
    req = urllib.request.Request('http://localhost:3000/api/telemetry/ports')
    with urllib.request.urlopen(req, timeout=5) as res:
        ports_data = json.loads(res.read().decode('utf-8'))
        print("Ports API Response:")
        print(json.dumps(ports_data, indent=2))
except Exception as e:
    print(f"Error querying /api/telemetry/ports: {e}")

# 2. Sample 10 events from /api/telemetry/stream
print("\n--- 2. Sampling SSE from /api/telemetry/stream ---")
try:
    req = urllib.request.Request('http://localhost:3000/api/telemetry/stream', headers={'Accept': 'text/event-stream'})
    with urllib.request.urlopen(req, timeout=30) as res:
        count = 0
        t0 = time.time()
        while count < 10 and (time.time() - t0) < 30:
            line = res.readline().decode('utf-8')
            if not line:
                break
            line_str = line.strip()
            if line_str.startswith('data:'):
                data_json = json.loads(line_str[5:].strip())
                count += 1
                t = data_json.get('telemetry', {})
                status = data_json.get('status', {})
                print(f"[Frame {count}] Time: {time.strftime('%H:%M:%S')} | Status: {t.get('status')} | Fault: {t.get('fault')} ({t.get('fault_code')}) | dI: {t.get('idiff')}A")
                print(f"   P1: {t.get('p1', {}).get('v')}V, {t.get('p1', {}).get('i')}A, Age: {t.get('p1', {}).get('age_ms')}ms, RSSI: {t.get('p1', {}).get('rssi')}dBm")
                print(f"   P2: {t.get('p2', {}).get('v')}V, {t.get('p2', {}).get('i')}A, Age: {t.get('p2', {}).get('age_ms')}ms, RSSI: {t.get('p2', {}).get('rssi')}dBm")
                print(f"   Port: {status.get('activePort')} (Connected: {status.get('gatewayConnected')})")
except Exception as e:
    print(f"Error reading SSE stream: {e}")
