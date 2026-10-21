import urllib.request
import json
import time

url = 'http://localhost:3000/api/telemetry/stream'
req = urllib.request.Request(url, headers={'Accept': 'text/event-stream'})

frames = []
t_start = time.time()
max_frames = 25
max_wait_seconds = 35

print(f"Sampling up to {max_frames} live telemetry frames over {max_wait_seconds}s...")

try:
    with urllib.request.urlopen(req, timeout=40) as response:
        while len(frames) < max_frames and (time.time() - t_start) < max_wait_seconds:
            line = response.readline().decode('utf-8')
            if not line:
                break
            if line.startswith('data: '):
                try:
                    payload = json.loads(line[6:].strip())
                    if 'telemetry' in payload and payload['telemetry']:
                        t = payload['telemetry']
                        raw = t.get('rawPayload', {})
                        frames.append({
                            'time': time.strftime('%H:%M:%S'),
                            'gw_ms': t.get('gw_ms'),
                            'status': t.get('status'),
                            'fault': t.get('fault'),
                            'fault_code': t.get('fault_code'),
                            'idiff': t.get('idiff'),
                            'trip_limit': t.get('trip_limit'),
                            'p1_v': t.get('p1', {}).get('v'),
                            'p1_i': t.get('p1', {}).get('i'),
                            'p1_p': t.get('p1', {}).get('p'),
                            'p1_rssi': t.get('p1', {}).get('rssi'),
                            'p1_snr': t.get('p1', {}).get('snr'),
                            'p1_age': t.get('p1', {}).get('age_ms'),
                            'p2_v': t.get('p2', {}).get('v'),
                            'p2_i': t.get('p2', {}).get('i'),
                            'p2_p': t.get('p2', {}).get('p'),
                            'p2_rssi': t.get('p2', {}).get('rssi'),
                            'p2_snr': t.get('p2', {}).get('snr'),
                            'p2_age': t.get('p2', {}).get('age_ms'),
                            'raw': raw
                        })
                except Exception as e:
                    pass
except Exception as err:
    print(f"Error sampling stream: {err}")

print(f"Successfully captured {len(frames)} frames.")

# Summary statistics
if frames:
    v1_vals = [f['p1_v'] for f in frames if f['p1_v'] is not None and f['p1_v'] > 0]
    v2_vals = [f['p2_v'] for f in frames if f['p2_v'] is not None and f['p2_v'] > 0]
    i1_vals = [f['p1_i'] for f in frames if f['p1_i'] is not None and f['p1_i'] > 0]
    i2_vals = [f['p2_i'] for f in frames if f['p2_i'] is not None and f['p2_i'] > 0]
    idiff_vals = [f['idiff'] for f in frames if f['idiff'] is not None]
    rssi1_vals = [f['p1_rssi'] for f in frames if f['p1_rssi']]
    rssi2_vals = [f['p2_rssi'] for f in frames if f['p2_rssi']]
    snr1_vals = [f['p1_snr'] for f in frames if f['p1_snr']]
    snr2_vals = [f['p2_snr'] for f in frames if f['p2_snr']]
    fault_codes = [f['fault_code'] for f in frames]

    analysis = {
        "sample_count": len(frames),
        "v1_stats": {"min": min(v1_vals), "max": max(v1_vals), "avg": round(sum(v1_vals)/len(v1_vals), 2)} if v1_vals else {},
        "v2_stats": {"min": min(v2_vals), "max": max(v2_vals), "avg": round(sum(v2_vals)/len(v2_vals), 2)} if v2_vals else {},
        "voltage_drop": round((sum(v1_vals)/len(v1_vals)) - (sum(v2_vals)/len(v2_vals)), 2) if v1_vals and v2_vals else 0,
        "i1_stats": {"min": min(i1_vals), "max": max(i1_vals), "avg": round(sum(i1_vals)/len(i1_vals), 3)} if i1_vals else {},
        "i2_stats": {"min": min(i2_vals), "max": max(i2_vals), "avg": round(sum(i2_vals)/len(i2_vals), 3)} if i2_vals else {},
        "idiff_stats": {"min": min(idiff_vals), "max": max(idiff_vals), "avg": round(sum(idiff_vals)/len(idiff_vals), 3)} if idiff_vals else {},
        "rssi_pole1": {"avg": round(sum(rssi1_vals)/len(rssi1_vals), 1)} if rssi1_vals else {},
        "rssi_pole2": {"avg": round(sum(rssi2_vals)/len(rssi2_vals), 1)} if rssi2_vals else {},
        "snr_pole1": {"avg": round(sum(snr1_vals)/len(snr1_vals), 1)} if snr1_vals else {},
        "snr_pole2": {"avg": round(sum(snr2_vals)/len(snr2_vals), 1)} if snr2_vals else {},
        "fault_distribution": {fc: fault_codes.count(fc) for fc in set(fault_codes)},
        "recent_frames": frames[-6:]
    }

    with open('scratch/analysis_report.json', 'w') as out:
        json.dump(analysis, out, indent=2)

    print("\n=== LIVE TELEMETRY ANALYSIS RESULTS ===")
    print(json.dumps(analysis, indent=2))
