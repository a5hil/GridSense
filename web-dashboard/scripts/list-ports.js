const { SerialPort } = require("./web-dashboard/node_modules/serialport");
(async () => {
  const ports = await SerialPort.list();
  console.log("ALL DETECTED PORTS:");
  for (const p of ports) {
    console.log(`Port: ${p.path} | Manufacturer: ${p.manufacturer || "N/A"} | VendorID: ${p.vendorId || "N/A"} | ProductID: ${p.productId || "N/A"}`);
  }
})();

