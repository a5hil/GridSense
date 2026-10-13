"""
GridSense - Real-Time Two-Pole FDIR Central Dashboard
MCA Project - FISAT
------------------------------------------------------
Connects to ESP32-S3 Central Gateway via USB Serial (115200 baud).
Visualizes:
- Pole 1 & Pole 2 Voltage, Current, Power, Frequency, PF, Energy
- Sub-GHz LoRa RF Link Quality (RSSI, SNR, Packet Seq)
- Central FDIR Differential Current Gauge (|I1 - I2| vs 0.35A Trip limit)
- Real-time Fault Alarm banner and historical event log
- Built-in Demo / Simulation generator for offline testing
"""

import sys
import time
import json
import re
import threading
import random
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

# Colors
BG_DARK = "#0B0F19"
BG_CARD = "#151E2E"
BG_CARD_LIGHT = "#1E293B"
BORDER_COLOR = "#334155"
TEXT_MAIN = "#F8FAFC"
TEXT_MUTED = "#94A3B8"
TEXT_DIM = "#64748B"

ACCENT_BLUE = "#38BDF8"
ACCENT_GREEN = "#10B981"
ACCENT_RED = "#EF4444"
ACCENT_AMBER = "#F59E0B"
ACCENT_PURPLE = "#A855F7"

class GridSenseDashboard(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("GridSense - FDIR Central Supervisory Dashboard (Two-Pole System)")
        self.geometry("1180x820")
        self.minsize(1050, 720)
        self.configure(bg=BG_DARK)

        # Telemetry State
        self.p1_data = {
            "online": False, "seq": 0, "v": 0.0, "i": 0.0, "p": 0.0,
            "f": 50.0, "pf": 1.0, "e": 0.0, "rssi": 0, "snr": 0, "last_ms": 0
        }
        self.p2_data = {
            "online": False, "seq": 0, "v": 0.0, "i": 0.0, "p": 0.0,
            "f": 50.0, "pf": 1.0, "e": 0.0, "rssi": 0, "snr": 0, "last_ms": 0
        }
        self.fdir_state = {
            "fault": "NORMAL", "action": "LINE_HEALTHY", "i_diff": 0.00,
            "threshold": 0.35, "last_update": time.time()
        }

        # Serial / Threading
        self.ser = None
        self.is_connected = False
        self.read_thread = None
        self.stop_event = threading.Event()
        self.demo_mode = False
        self.demo_thread = None

        self._init_ui()
        self._refresh_ports()
        self._start_heartbeat_checker()

    def _init_ui(self):
        # 1. Header Bar
        header = tk.Frame(self, bg=BG_CARD, height=60, padx=20, pady=10)
        header.pack(fill=tk.X, side=tk.TOP)
        header.pack_propagate(False)

        title_frame = tk.Frame(header, bg=BG_CARD)
        title_frame.pack(side=tk.LEFT)

        lbl_title = tk.Label(title_frame, text="⚡ GRIDSENSE", font=("Segoe UI", 16, "bold"), fg=ACCENT_BLUE, bg=BG_CARD)
        lbl_title.pack(side=tk.LEFT)

        lbl_sub = tk.Label(title_frame, text=" | IoT Fault Detection, Isolation & Restoration", 
                           font=("Segoe UI", 11), fg=TEXT_MUTED, bg=BG_CARD)
        lbl_sub.pack(side=tk.LEFT)

        # Connection Controls
        conn_frame = tk.Frame(header, bg=BG_CARD)
        conn_frame.pack(side=tk.RIGHT)

        tk.Label(conn_frame, text="Gateway Port:", font=("Segoe UI", 9), fg=TEXT_MUTED, bg=BG_CARD).pack(side=tk.LEFT, padx=(0, 6))

        self.port_combo = ttk.Combobox(conn_frame, width=14, state="readonly")
        self.port_combo.pack(side=tk.LEFT, padx=(0, 6))

        btn_refresh = tk.Button(conn_frame, text="🔄", font=("Segoe UI", 9), bg=BG_CARD_LIGHT, fg=TEXT_MAIN,
                                bd=0, padx=6, pady=2, command=self._refresh_ports, activebackground=BORDER_COLOR)
        btn_refresh.pack(side=tk.LEFT, padx=(0, 10))

        self.btn_connect = tk.Button(conn_frame, text="Connect", font=("Segoe UI", 9, "bold"),
                                     bg=ACCENT_BLUE, fg="#0F172A", bd=0, padx=14, pady=4,
                                     command=self._toggle_connection, cursor="hand2")
        self.btn_connect.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_demo = tk.Button(conn_frame, text="▶ Demo Mode", font=("Segoe UI", 9, "bold"),
                                  bg=ACCENT_PURPLE, fg="#FFFFFF", bd=0, padx=12, pady=4,
                                  command=self._toggle_demo_mode, cursor="hand2")
        self.btn_demo.pack(side=tk.LEFT)

        # 2. Main Content Frame
        main_content = tk.Frame(self, bg=BG_DARK, padx=16, pady=12)
        main_content.pack(fill=tk.BOTH, expand=True)

        # Top row: FDIR System Banner
        self._build_fdir_banner(main_content)

        # Middle row: Pole 1 and Pole 2 Cards
        poles_frame = tk.Frame(main_content, bg=BG_DARK)
        poles_frame.pack(fill=tk.BOTH, expand=False, pady=10)

        self.p1_widgets = self._build_pole_card(poles_frame, pole_id=1, name="Pole 1 (Incomer)", side=tk.LEFT)
        self.p2_widgets = self._build_pole_card(poles_frame, pole_id=2, name="Pole 2 (Outgoing)", side=tk.RIGHT)

        # Bottom row: Live Event Log & Diagnostics
        self._build_event_log(main_content)

    def _build_fdir_banner(self, parent):
        banner_frame = tk.Frame(parent, bg=BG_CARD, bd=1, relief=tk.SOLID, padx=16, pady=12)
        banner_frame.pack(fill=tk.X)

        top_info = tk.Frame(banner_frame, bg=BG_CARD)
        top_info.pack(fill=tk.X)

        tk.Label(top_info, text="CENTRAL FDIR SUPERVISORY STATUS", font=("Segoe UI", 11, "bold"),
                 fg=TEXT_MUTED, bg=BG_CARD).pack(side=tk.LEFT)

        self.lbl_crypto_badge = tk.Label(top_info, text="🔒 AES-128 HW SECURED", font=("Segoe UI", 8, "bold"),
                                         fg=ACCENT_GREEN, bg="#064E3B", padx=6, pady=2)
        self.lbl_crypto_badge.pack(side=tk.LEFT, padx=(12, 0))

        self.lbl_fdir_time = tk.Label(top_info, text="Last Eval: Waiting...", font=("Segoe UI", 9),
                                      fg=TEXT_DIM, bg=BG_CARD)
        self.lbl_fdir_time.pack(side=tk.RIGHT)

        # Differential current and status banner
        center_row = tk.Frame(banner_frame, bg=BG_CARD, pady=8)
        center_row.pack(fill=tk.X)

        # Gauge / Metric on Left
        gauge_box = tk.Frame(center_row, bg=BG_CARD_LIGHT, padx=16, pady=8, bd=1, relief=tk.SOLID)
        gauge_box.pack(side=tk.LEFT, padx=(0, 16))

        tk.Label(gauge_box, text="INTER-POLE DIFFERENTIAL CURRENT (|I₁ - I₂|)",
                 font=("Segoe UI", 8, "bold"), fg=TEXT_MUTED, bg=BG_CARD_LIGHT).pack(anchor="w")

        val_frame = tk.Frame(gauge_box, bg=BG_CARD_LIGHT)
        val_frame.pack(fill=tk.X, pady=2)

        self.lbl_idiff = tk.Label(val_frame, text="0.000", font=("Segoe UI", 24, "bold"),
                                  fg=ACCENT_BLUE, bg=BG_CARD_LIGHT)
        self.lbl_idiff.pack(side=tk.LEFT)

        tk.Label(val_frame, text=" A", font=("Segoe UI", 14, "bold"), fg=TEXT_MUTED, bg=BG_CARD_LIGHT).pack(side=tk.LEFT, pady=(8,0))

        tk.Label(gauge_box, text="Trip Threshold: 0.350 A (350 mA)", font=("Segoe UI", 8),
                 fg=TEXT_DIM, bg=BG_CARD_LIGHT).pack(anchor="w")

        # Visual Bar Canvas
        self.canvas_diff = tk.Canvas(gauge_box, width=320, height=18, bg="#0B0F19", highlightthickness=0)
        self.canvas_diff.pack(pady=4)
        self._draw_diff_bar(0.0)

        # Status & Action on Right
        status_box = tk.Frame(center_row, bg=BG_CARD)
        status_box.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.lbl_fault_badge = tk.Label(status_box, text="SYSTEM STATUS: NORMAL",
                                        font=("Segoe UI", 15, "bold"), fg=ACCENT_GREEN, bg=BG_CARD, anchor="w")
        self.lbl_fault_badge.pack(fill=tk.X)

        self.lbl_action_text = tk.Label(status_box, text="Protection Decision: LINE_HEALTHY (No active trips)",
                                        font=("Segoe UI", 11), fg=TEXT_MAIN, bg=BG_CARD, anchor="w")
        self.lbl_action_text.pack(fill=tk.X, pady=(4, 0))

        self.lbl_summary_text = tk.Label(status_box, text="Both poles reporting synchronously via Sub-GHz LoRa.",
                                         font=("Segoe UI", 9), fg=TEXT_MUTED, bg=BG_CARD, anchor="w")
        self.lbl_summary_text.pack(fill=tk.X)

    def _draw_diff_bar(self, idiff):
        self.canvas_diff.delete("all")
        w = 320
        h = 18

        # Background
        self.canvas_diff.create_rectangle(0, 0, w, h, fill="#1E293B", outline="")

        # Trip limit marker at 0.35A (scale max = 4.0A)
        max_a = 4.0
        pct = min(1.0, max(0.0, idiff / max_a))
        bar_w = int(w * pct)

        trip_pct = 0.35 / max_a
        trip_x = int(w * trip_pct)

        # Fill color based on trip
        fill_color = ACCENT_RED if idiff >= 0.35 else (ACCENT_AMBER if idiff >= 0.20 else ACCENT_GREEN)
        self.canvas_diff.create_rectangle(0, 0, bar_w, h, fill=fill_color, outline="")

        # Trip Threshold Line
        self.canvas_diff.create_line(trip_x, 0, trip_x, h, fill="#FFFFFF", width=2, dash=(2, 2))

    def _build_pole_card(self, parent, pole_id, name, side):
        frame = tk.Frame(parent, bg=BG_CARD, bd=1, relief=tk.SOLID, padx=16, pady=12)
        frame.pack(side=side, fill=tk.BOTH, expand=True, padx=6 if side == tk.RIGHT else 0)

        # Card Title Row
        top_row = tk.Frame(frame, bg=BG_CARD)
        top_row.pack(fill=tk.X)

        lbl_name = tk.Label(top_row, text=f"POLE {pole_id} - {name.upper()}",
                            font=("Segoe UI", 12, "bold"), fg=ACCENT_BLUE, bg=BG_CARD)
        lbl_name.pack(side=tk.LEFT)

        lbl_badge = tk.Label(top_row, text="● OFFLINE", font=("Segoe UI", 9, "bold"),
                             fg=ACCENT_RED, bg=BG_CARD)
        lbl_badge.pack(side=tk.RIGHT)

        # Metrics Grid
        grid = tk.Frame(frame, bg=BG_CARD, pady=8)
        grid.pack(fill=tk.X)

        widgets = {"badge": lbl_badge}

        def make_metric(parent_grid, row, col, label_text, default_val, unit, val_color=TEXT_MAIN):
            box = tk.Frame(parent_grid, bg=BG_CARD_LIGHT, padx=10, pady=6, bd=1, relief=tk.SOLID)
            box.grid(row=row, column=col, padx=4, pady=4, sticky="nsew")
            parent_grid.grid_columnconfigure(col, weight=1)

            tk.Label(box, text=label_text, font=("Segoe UI", 8), fg=TEXT_MUTED, bg=BG_CARD_LIGHT).pack(anchor="w")
            val_frame = tk.Frame(box, bg=BG_CARD_LIGHT)
            val_frame.pack(anchor="w")

            lbl_v = tk.Label(val_frame, text=default_val, font=("Segoe UI", 14, "bold"), fg=val_color, bg=BG_CARD_LIGHT)
            lbl_v.pack(side=tk.LEFT)
            tk.Label(val_frame, text=f" {unit}", font=("Segoe UI", 9), fg=TEXT_DIM, bg=BG_CARD_LIGHT).pack(side=tk.LEFT, pady=(3,0))
            return lbl_v

        widgets["v"] = make_metric(grid, 0, 0, "VOLTAGE", "---.-", "V", ACCENT_BLUE)
        widgets["i"] = make_metric(grid, 0, 1, "CURRENT", "-.---", "A", ACCENT_GREEN)
        widgets["p"] = make_metric(grid, 1, 0, "ACTIVE POWER", "---.-", "W")
        widgets["f"] = make_metric(grid, 1, 1, "FREQUENCY", "50.0", "Hz")
        widgets["pf"] = make_metric(grid, 2, 0, "POWER FACTOR", "1.00", "PF")
        widgets["e"] = make_metric(grid, 2, 1, "ENERGY", "---.-", "Wh")

        # RF Link / Diagnostics Row
        rf_box = tk.Frame(frame, bg=BG_CARD, pady=4)
        rf_box.pack(fill=tk.X)

        lbl_rf = tk.Label(rf_box, text="LoRa: RSSI: -- dBm | SNR: -- dB | Pkt Seq: 0 | Age: --s",
                          font=("Consolas", 8), fg=TEXT_DIM, bg=BG_CARD, anchor="w")
        lbl_rf.pack(fill=tk.X)
        widgets["rf"] = lbl_rf

        return widgets

    def _build_event_log(self, parent):
        log_frame = tk.Frame(parent, bg=BG_CARD, bd=1, relief=tk.SOLID, padx=14, pady=10)
        log_frame.pack(fill=tk.BOTH, expand=True, pady=(10, 0))

        head_row = tk.Frame(log_frame, bg=BG_CARD)
        head_row.pack(fill=tk.X, pady=(0, 6))

        tk.Label(head_row, text="REAL-TIME TELEMETRY & FDIR EVENT LOG",
                 font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED, bg=BG_CARD).pack(side=tk.LEFT)

        btn_clear = tk.Button(head_row, text="Clear Log", font=("Segoe UI", 8),
                              bg=BG_CARD_LIGHT, fg=TEXT_MAIN, bd=0, padx=8, pady=2,
                              command=lambda: self.log_text.delete("1.0", tk.END))
        btn_clear.pack(side=tk.RIGHT)

        self.log_text = scrolledtext.ScrolledText(log_frame, bg="#080C14", fg="#E2E8F0",
                                                   font=("Consolas", 9), bd=0, padx=8, pady=6, height=8)
        self.log_text.pack(fill=tk.BOTH, expand=True)

        # Tags for log coloring
        self.log_text.tag_config("NORMAL", foreground=ACCENT_GREEN)
        self.log_text.tag_config("FAULT", foreground=ACCENT_RED)
        self.log_text.tag_config("WARN", foreground=ACCENT_AMBER)
        self.log_text.tag_config("INFO", foreground=ACCENT_BLUE)
        self.log_text.tag_config("TIMESTAMP", foreground=TEXT_DIM)

    def _log(self, text, tag="INFO"):
        t_str = time.strftime("[%H:%M:%S] ")
        self.log_text.insert(tk.END, t_str, "TIMESTAMP")
        self.log_text.insert(tk.END, text + "\n", tag)
        self.log_text.see(tk.END)

    def _refresh_ports(self):
        if not SERIAL_AVAILABLE:
            self.port_combo["values"] = ["No pyserial"]
            return
        ports = [p.device for p in serial.tools.list_ports.comports()]
        if not ports:
            self.port_combo["values"] = ["No COM Ports"]
            self.port_combo.current(0)
        else:
            self.port_combo["values"] = ports
            self.port_combo.current(0)

    def _toggle_connection(self):
        if self.is_connected:
            self._disconnect()
        else:
            self._connect()

    def _connect(self):
        if not SERIAL_AVAILABLE:
            messagebox.showerror("Error", "pyserial is not installed.")
            return

        port = self.port_combo.get()
        if not port or port.startswith("No"):
            messagebox.showwarning("Warning", "Please select a valid COM port.")
            return

        # Ensure demo simulation is stopped when connecting to real hardware
        if self.demo_mode:
            self._toggle_demo_mode()

        try:
            self.ser = serial.Serial(port, 115200, timeout=1.0)
            self.is_connected = True
            self.stop_event.clear()
            self.btn_connect.config(text="Disconnect", bg=ACCENT_RED, fg="#FFFFFF")
            self._log(f"Connected to Gateway on {port} (115200 baud)", "INFO")

            self.read_thread = threading.Thread(target=self._serial_reader_loop, daemon=True)
            self.read_thread.start()
        except Exception as ex:
            messagebox.showerror("Connection Failed", f"Could not open {port}:\n{str(ex)}")

    def _disconnect(self):
        self.stop_event.set()
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass
            self.ser = None
        self.is_connected = False
        self.btn_connect.config(text="Connect", bg=ACCENT_BLUE, fg="#0F172A")
        self._log("Disconnected from Gateway.", "WARN")

    def _serial_reader_loop(self):
        while not self.stop_event.is_set():
            try:
                line = self.ser.readline().decode("utf-8", errors="replace").strip()
                if line:
                    self.after(0, self._process_gateway_line, line)
            except Exception as e:
                if not self.stop_event.is_set():
                    self.after(0, self._log, f"Serial Read Error: {e}", "FAULT")
                break

    def _process_gateway_line(self, line):
        # 1. Check if line contains JSON payload from Gateway
        if "{" in line and "}" in line:
            json_str = line[line.find("{"):line.rfind("}") + 1]
            try:
                data = json.loads(json_str)
                # Matches gateway comprehensive packet or FDIR broadcast
                if any(k in data for k in ("gw_ms", "fault", "idiff", "i_diff", "type")):
                    self._handle_gateway_json(data)
                    return
            except json.JSONDecodeError:
                pass

        # 2. Check for Gateway formatted console line:
        # Inter-Pole Diff Current (Idiff) : 1.525 A (Trip limit: 0.350 A)
        diff_match = re.search(r"Inter-Pole Diff Current \(Idiff\)\s*:\s*([\d\.]+)\s*A", line)
        if diff_match:
            idiff = float(diff_match.group(1))
            self.lbl_idiff.config(text=f"{idiff:.3f}")
            self._draw_diff_bar(idiff)
            return

        # Central FDIR Decision : [TRIP/ALERT] - DIFF_LEAKAGE
        dec_match = re.search(r"Central FDIR Decision\s*:\s*\[([^\]]+)\]\s*-\s*(\w+)", line)
        if dec_match:
            fault_type = dec_match.group(2)
            self._update_fdir({"fault": fault_type, "idiff": float(self.lbl_idiff.cget("text") or 0.0)})
            return

        # 3. Check if line is formatted Pole Telemetry from Gateway printf:
        # [RX POLE 1] Seq: 4 | V: 230.1V | I: 2.450A | P: 535.4W | Freq: 50.0Hz | PF: 0.95 | E: 1422.0Wh | RSSI: -34 dBm | SNR: 15 dB
        rx_match = re.search(r"\[RX POLE (\d)\] Seq: (\d+) \| V: ([\d\.]+)V \| I: ([\d\.]+)A \| P: ([\d\.]+)W \| Freq: ([\d\.]+)Hz \| PF: ([\d\.]+) \| E: ([\d\.]+)Wh \| RSSI: ([-\d]+) dBm \| SNR: ([-\d]+) dB", line)
        if rx_match:
            pid = int(rx_match.group(1))
            pole = {
                "online": True,
                "seq": int(rx_match.group(2)),
                "v": float(rx_match.group(3)),
                "i": float(rx_match.group(4)),
                "p": float(rx_match.group(5)),
                "f": float(rx_match.group(6)),
                "pf": float(rx_match.group(7)),
                "e": float(rx_match.group(8)),
                "rssi": int(rx_match.group(9)),
                "snr": int(rx_match.group(10)),
                "last_ms": time.time()
            }
            if pid == 1:
                self.p1_data = pole
                self._update_pole_ui(1, pole)
            elif pid == 2:
                self.p2_data = pole
                self._update_pole_ui(2, pole)
            self._log(f"Telemetry received from Pole {pid}: V={pole['v']}V, I={pole['i']:.3f}A, RSSI={pole['rssi']}dBm", "INFO")
            return

        # 4. Raw diagnostic or startup message
        self._log(line, "TIMESTAMP")

    def _handle_gateway_json(self, data):
        # Emergency Outage Broadcast ("Last Gasp") handling
        if data.get("type") == "LAST_GASP" or data.get("fault") == "OUTAGE_LAST_GASP":
            pole = data.get("pole", 1)
            relay = data.get("relay", pole)
            hops = data.get("hops", 0)
            v_prev = float(data.get("v_prev", 230.0))
            i_prev = float(data.get("i_prev", 2.45))
            rssi = data.get("rssi", -35)
            snr = data.get("snr", 15)

            route_str = "Direct (1-hop)" if hops == 0 else f"Relayed via P{relay} ({hops}h)"

            dying_pole_data = {
                "online": True,
                "v": 0.0,
                "i": 0.0,
                "p": 0.0,
                "f": 0.0,
                "pf": 0.0,
                "e": self.p1_data["e"] if pole == 1 else self.p2_data["e"],
                "rssi": rssi,
                "snr": snr,
                "relay": relay,
                "hops": hops,
                "last_ms": time.time()
            }
            if pole == 1:
                self.p1_data.update(dying_pole_data)
                self._update_pole_ui(1, self.p1_data)
                self.p1_widgets["badge"].config(text="● LAST GASP (0V)", fg=ACCENT_RED)
            elif pole == 2:
                self.p2_data.update(dying_pole_data)
                self._update_pole_ui(2, self.p2_data)
                self.p2_widgets["badge"].config(text="● LAST GASP (0V)", fg=ACCENT_RED)

            self.fdir_state["fault"] = "OUTAGE_LAST_GASP"
            self.fdir_state["action"] = "DISPATCH_CREW_OUTAGE"
            self.fdir_state["last_update"] = time.time()

            self.lbl_fault_badge.config(text=f"⚡ CRITICAL: LAST GASP OUTAGE BROADCAST (POLE #{pole})", fg=ACCENT_RED)
            self.lbl_action_text.config(text=f"Supervisory Action: DISPATCH_CREW_OUTAGE (Route: {route_str})", fg=ACCENT_RED)
            self.lbl_summary_text.config(text=f"Pole {pole} experienced catastrophic power collapse (V dropped from {v_prev:.1f}V to 0.0V). Final dying breath packet captured via LoRa.")
            self._log(f"[LAST GASP ALERT] Pole #{pole} Outage Broadcast! Prior: {v_prev:.1f}V, {i_prev:.3f}A -> 0V. Route: {route_str}, RSSI: {rssi} dBm", "FAULT")
            return

        fault = data.get("fault", "NORMAL")
        i_diff = float(data.get("idiff", data.get("i_diff", 0.0)))

        # Update Encryption Security Tag Badge
        sec = data.get("sec", "AES128")
        if sec == "AES128":
            self.lbl_crypto_badge.config(text="🔒 AES-128 HW SECURED", fg=ACCENT_GREEN, bg="#064E3B")
        else:
            self.lbl_crypto_badge.config(text="🔓 PLAINTEXT", fg=TEXT_DIM, bg=BG_CARD_LIGHT)

        # Update Pole 1 if nested p1 block present
        if "p1" in data and isinstance(data["p1"], dict):
            p1_b = data["p1"]
            age_ms = p1_b.get("age_ms", 0)
            self.p1_data.update({
                "online": (age_ms < 10000),
                "seq": self.p1_data.get("seq", 0) + 1,
                "v": float(p1_b.get("v", self.p1_data.get("v", 0.0))),
                "i": float(p1_b.get("i", self.p1_data.get("i", 0.0))),
                "p": float(p1_b.get("p", self.p1_data.get("p", 0.0))),
                "pf": float(p1_b.get("pf", 0.95)),
                "rssi": int(p1_b.get("rssi", -30)),
                "snr": int(p1_b.get("snr", 15)),
                "relay": int(p1_b.get("relay", 1)),
                "hops": int(p1_b.get("hops", 0)),
                "last_ms": time.time() - (age_ms / 1000.0)
            })
            self._update_pole_ui(1, self.p1_data)

        # Update Pole 2 if nested p2 block present
        if "p2" in data and isinstance(data["p2"], dict):
            p2_b = data["p2"]
            age_ms = p2_b.get("age_ms", 0)
            self.p2_data.update({
                "online": (age_ms < 10000),
                "seq": self.p2_data.get("seq", 0) + 1,
                "v": float(p2_b.get("v", self.p2_data.get("v", 0.0))),
                "i": float(p2_b.get("i", self.p2_data.get("i", 0.0))),
                "p": float(p2_b.get("p", self.p2_data.get("p", 0.0))),
                "pf": float(p2_b.get("pf", 0.95)),
                "rssi": int(p2_b.get("rssi", -35)),
                "snr": int(p2_b.get("snr", 15)),
                "relay": int(p2_b.get("relay", 2)),
                "hops": int(p2_b.get("hops", 0)),
                "last_ms": time.time() - (age_ms / 1000.0)
            })
            self._update_pole_ui(2, self.p2_data)

        # Flat fields fallback
        if "p1_I" in data:
            self.p1_data["i"] = float(data["p1_I"])
            if "p1_V" in data: self.p1_data["v"] = float(data["p1_V"])
            self.p1_data["online"] = data.get("p1_online", True)
            self._update_pole_ui(1, self.p1_data)
        if "p2_I" in data:
            self.p2_data["i"] = float(data["p2_I"])
            if "p2_V" in data: self.p2_data["v"] = float(data["p2_V"])
            self.p2_data["online"] = data.get("p2_online", True)
            self._update_pole_ui(2, self.p2_data)

        action = data.get("action")
        if not action:
            if fault == "DIFF_LEAKAGE":
                action = "TRIP_ISOLATE_POLE_1_2"
            elif fault == "OVERCURRENT":
                action = "TRIP_OVERCURRENT_SHED"
            elif fault == "UNDERVOLTAGE":
                action = "ALARM_UNDERVOLTAGE"
            elif fault == "OVERVOLTAGE":
                action = "ALARM_OVERVOLTAGE"
            elif fault == "POWERCUT":
                action = "FEEDER_DE_ENERGIZED"
            elif fault == "LINE_BREAK":
                action = "ISOLATE_SPAN_1_2"
            elif fault == "POLE_OFFLINE":
                action = "WARN_POLE_OFFLINE"
            else:
                action = "LINE_HEALTHY"

        self._update_fdir({
            "fault": fault,
            "action": action,
            "idiff": i_diff,
            "p1_online": self.p1_data.get("online", True),
            "p2_online": self.p2_data.get("online", True)
        })

    def _update_fdir(self, data):
        fault = data.get("fault", "NORMAL")
        action = data.get("action", "")
        i_diff = float(data.get("idiff", data.get("i_diff", 0.0)))
        p1_on = data.get("p1_online", True)
        p2_on = data.get("p2_online", True)

        if not action:
            if fault == "DIFF_LEAKAGE": action = "TRIP_ISOLATE_POLE_1_2"
            elif fault == "OVERCURRENT": action = "TRIP_OVERCURRENT_SHED"
            elif fault == "UNDERVOLTAGE": action = "ALARM_UNDERVOLTAGE"
            elif fault == "POWERCUT": action = "FEEDER_DE_ENERGIZED"
            elif fault == "LINE_BREAK": action = "ISOLATE_SPAN_1_2"
            elif fault == "POLE_OFFLINE": action = "WARN_POLE_OFFLINE"
            elif fault == "OUTAGE_LAST_GASP": action = "DISPATCH_CREW_OUTAGE"
            else: action = "LINE_HEALTHY"

        self.fdir_state["fault"] = fault
        self.fdir_state["action"] = action
        self.fdir_state["i_diff"] = i_diff
        self.fdir_state["last_update"] = time.time()

        # Update Banner GUI
        self.lbl_idiff.config(text=f"{i_diff:.3f}")
        self._draw_diff_bar(i_diff)

        # Color-code based on fault state
        if fault == "NORMAL":
            self.lbl_fault_badge.config(text="● SYSTEM STATUS: NORMAL", fg=ACCENT_GREEN)
            self.lbl_action_text.config(text=f"Supervisory Status: {action} (Differential < 0.35A)", fg=TEXT_MAIN)
            self.lbl_summary_text.config(text="Inter-pole current is balanced. Power distribution is healthy.")
            log_tag = "NORMAL"
        elif fault == "OUTAGE_LAST_GASP":
            self.lbl_fault_badge.config(text="⚡ CRITICAL: LAST GASP DYING OUTAGE BROADCAST!", fg=ACCENT_RED)
            self.lbl_action_text.config(text=f"Supervisory Status: {action} (Feeder Power Collapse)", fg=ACCENT_RED)
            self.lbl_summary_text.config(text="Edge Node broadcast its final dying breath packet before power depletion.")
            log_tag = "FAULT"
        elif fault == "POWERCUT":
            self.lbl_fault_badge.config(text="● GRID STATUS: SCHEDULED POWERCUT / LOAD SHEDDING", fg=ACCENT_BLUE)
            self.lbl_action_text.config(text=f"Supervisory Status: {action} (Feeder De-energized)", fg=ACCENT_BLUE)
            self.lbl_summary_text.config(text="Both poles report 0V. Upstream substation supply is off. No localized line fault.")
            log_tag = "INFO"
        elif fault == "LINE_BREAK":
            self.lbl_fault_badge.config(text="⚠ CRITICAL: PHYSICAL CONDUCTOR SNAP / BREAK!", fg=ACCENT_RED)
            self.lbl_action_text.config(text=f"Supervisory Status: {action} (Open circuit on Span 1-2)", fg=ACCENT_RED)
            self.lbl_summary_text.config(text="Pole 1 is energized (230V) but Pole 2 has collapsed to 0V. Physical line break on span.")
            log_tag = "FAULT"
        elif fault == "DIFF_LEAKAGE":
            self.lbl_fault_badge.config(text="⚠ CRITICAL: INTER-POLE LEAKAGE DETECTED!", fg=ACCENT_RED)
            self.lbl_action_text.config(text=f"Supervisory Status: {action} (Leakage ≥ 0.35A)", fg=ACCENT_RED)
            self.lbl_summary_text.config(text=f"Current imbalance |I₁ - I₂| = {i_diff:.3f}A exceeds 0.35A limit. Vegetation touch / line tapping.")
            log_tag = "FAULT"
        elif fault == "OVERCURRENT":
            self.lbl_fault_badge.config(text="⚠ ALARM: LINE OVERCURRENT DETECTED!", fg=ACCENT_RED)
            self.lbl_action_text.config(text=f"Supervisory Status: {action}", fg=ACCENT_RED)
            self.lbl_summary_text.config(text="Line current exceeded safety threshold (> 16A).")
            log_tag = "FAULT"
        elif fault == "UNDERVOLTAGE":
            self.lbl_fault_badge.config(text="⚠ WARNING: GRID UNDERVOLTAGE SAG", fg=ACCENT_AMBER)
            self.lbl_action_text.config(text=f"Supervisory Status: {action}", fg=ACCENT_AMBER)
            self.lbl_summary_text.config(text="Grid voltage dipped below 180V brownout threshold.")
            log_tag = "WARN"
        elif fault == "POLE_OFFLINE":
            self.lbl_fault_badge.config(text="● NOTICE: POLE TELEMETRY OFFLINE", fg=ACCENT_AMBER)
            self.lbl_action_text.config(text=f"Supervisory Status: {action}", fg=ACCENT_AMBER)
            self.lbl_summary_text.config(text=f"P1: {'Online' if p1_on else 'OFFLINE'} | P2: {'Online' if p2_on else 'OFFLINE'}")
            log_tag = "WARN"
        else:
            self.lbl_fault_badge.config(text=f"STATUS: {fault}", fg=ACCENT_BLUE)
            self.lbl_action_text.config(text=f"Action: {action}", fg=TEXT_MAIN)
            log_tag = "INFO"

        self.lbl_fdir_time.config(text=f"Last Eval: {time.strftime('%H:%M:%S')}")
        self._log(f"[FDIR EVAL] Fault: {fault} | ΔI: {i_diff:.3f}A | Action: {action}", log_tag)

    def _update_pole_ui(self, pid, data):
        w = self.p1_widgets if pid == 1 else self.p2_widgets
        w["badge"].config(text="● ONLINE", fg=ACCENT_GREEN)
        w["v"].config(text=f"{data['v']:.1f}")
        w["i"].config(text=f"{data['i']:.3f}")
        w["p"].config(text=f"{data['p']:.1f}")
        w["f"].config(text=f"{data['f']:.1f}")
        w["pf"].config(text=f"{data['pf']:.2f}")
        w["e"].config(text=f"{data['e']:.1f}")

        hops = data.get("hops", 0)
        relay = data.get("relay", pid)
        route_str = "Direct (1-hop)" if hops == 0 else f"Relayed via P{relay} ({hops}h)"

        w["rf"].config(
            text=f"LoRa: RSSI: {data['rssi']} dBm | SNR: {data['snr']} dB | Route: {route_str} | Just now",
            fg=ACCENT_BLUE
        )

    def _start_heartbeat_checker(self):
        now = time.time()
        for pid, data, w in [(1, self.p1_data, self.p1_widgets), (2, self.p2_data, self.p2_widgets)]:
            if data["last_ms"] > 0:
                age = int(now - data["last_ms"])
                if age > 10:
                    data["online"] = False
                    w["badge"].config(text="● OFFLINE", fg=ACCENT_RED)
                    w["rf"].config(fg=TEXT_DIM)
                else:
                    hops = data.get("hops", 0)
                    relay = data.get("relay", pid)
                    route_str = "Direct" if hops == 0 else f"via P{relay}"
                    w["rf"].config(
                        text=f"LoRa: RSSI: {data['rssi']} dBm | Route: {route_str} | Age: {age}s"
                    )

        self.after(1000, self._start_heartbeat_checker)

    def _toggle_demo_mode(self):
        if self.demo_mode:
            self.demo_mode = False
            self.btn_demo.config(text="▶ Demo Mode", bg=ACCENT_PURPLE)
            self._log("Demo Simulation Stopped.", "WARN")
        else:
            self.demo_mode = True
            self.btn_demo.config(text="⏹ Stop Demo", bg=ACCENT_RED)
            self._log("Demo Simulation Started (Simulating 2 Poles & Central Gateway FDIR)...", "INFO")
            self.demo_thread = threading.Thread(target=self._demo_simulator_loop, daemon=True)
            self.demo_thread.start()

    def _demo_simulator_loop(self):
        """Simulates realistic telemetry from Pole 1, Pole 2, and Gateway FDIR evaluation"""
        step = 0
        seq1, seq2 = 1, 1
        e1, e2 = 1420.0, 1418.5

        while self.demo_mode:
            step += 1
            seq1 += 1
            seq2 += 1
            e1 += 0.3
            e2 += 0.3

            # Scenario cycling: Normal -> Differential Leakage -> Normal -> Overcurrent
            if 7 <= (step % 20) <= 12:
                # Differential Fault: Pole 1 has 3.85A, Pole 2 has 1.15A
                v1, v2 = 227.4 + random.uniform(-1, 1), 224.8 + random.uniform(-1, 1)
                i1, i2 = 3.85 + random.uniform(-0.02, 0.02), 1.15 + random.uniform(-0.02, 0.02)
                fault = "DIFF_LEAKAGE"
                action = "TRIP_ISOLATE_POLE_1_2"
            elif (step % 20) == 16:
                # Overcurrent Fault
                v1, v2 = 221.0, 220.5
                i1, i2 = 18.4, 18.2
                fault = "OVERCURRENT"
                action = "TRIP_OVERCURRENT_SHED"
            elif (step % 20) == 18:
                # Simulated Last Gasp dying outage from Pole 2 relayed via Pole 1
                last_gasp_json = json.dumps({
                    "gw_ms": int(time.time() * 1000),
                    "type": "LAST_GASP",
                    "pole": 2,
                    "relay": 1,
                    "hops": 1,
                    "v_prev": 229.8,
                    "i_prev": 2.45,
                    "rssi": -42,
                    "snr": 12,
                    "status": "ALERT",
                    "fault": "OUTAGE_LAST_GASP",
                    "action": "DISPATCH_CREW_OUTAGE"
                })
                self.after(0, self._process_gateway_line, last_gasp_json)
                time.sleep(2.5)
                continue
            else:
                # Normal State: Balanced currents
                v1 = 230.2 + random.uniform(-0.8, 0.8)
                v2 = 229.8 + random.uniform(-0.8, 0.8)
                base_i = 2.45 + random.uniform(-0.05, 0.05)
                i1 = base_i
                i2 = base_i - random.uniform(0.01, 0.04) # Normal small variation
                fault = "NORMAL"
                action = "LINE_HEALTHY"

            i_diff = abs(i1 - i2)

            # Synthetic Pole 1 packet
            p1_pkt = f"[RX POLE 1] Seq: {seq1} | V: {v1:.1f}V | I: {i1:.3f}A | P: {v1*i1*0.95:.1f}W | Freq: 50.0Hz | PF: 0.95 | E: {e1:.1f}Wh | RSSI: -34 dBm | SNR: 15 dB"
            self.after(0, self._process_gateway_line, p1_pkt)

            time.sleep(0.5)

            # Synthetic Pole 2 packet
            p2_pkt = f"[RX POLE 2] Seq: {seq2} | V: {v2:.1f}V | I: {i2:.3f}A | P: {v2*i2*0.95:.1f}W | Freq: 50.0Hz | PF: 0.95 | E: {e2:.1f}Wh | RSSI: -38 dBm | SNR: 14 dB"
            self.after(0, self._process_gateway_line, p2_pkt)

            time.sleep(0.5)

            # Synthetic FDIR status from Gateway
            fdir_json = json.dumps({
                "type": "FDIR_STATUS",
                "ts": int(time.time() * 1000),
                "sec": "AES128",
                "p1_online": True,
                "p2_online": True,
                "p1_I": round(i1, 2),
                "p2_I": round(i2, 2),
                "i_diff": round(i_diff, 2),
                "p1_V": round(v1, 1),
                "p2_V": round(v2, 1),
                "fault": fault,
                "action": action
            })
            self.after(0, self._process_gateway_line, fdir_json)

            time.sleep(2.5)

if __name__ == "__main__":
    app = GridSenseDashboard()
    app.mainloop()
