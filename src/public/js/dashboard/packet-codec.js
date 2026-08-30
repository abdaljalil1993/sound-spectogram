export function isCompressedMatrixPayload(value) {
  return (
    value &&
    typeof value === "object" &&
    value.format === "gzip-base64-json-v1" &&
    typeof value.payload === "string"
  );
}

export function decodeCompressedMatrixPayload(stored) {
  if (!isCompressedMatrixPayload(stored)) {
    return stored;
  }

  var pako = typeof window !== "undefined" ? window.pako : null;
  if (!pako || typeof pako.inflate !== "function") {
    throw new Error("مكتبة فك الضغط pako غير متاحة في المتصفح");
  }

  var binary = atob(stored.payload);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  try {
    var inflatedText = pako.inflate(bytes, { to: "string" });
    return JSON.parse(String(inflatedText).trim());
  } catch (_firstError) {
    // Fallback path: decode as UTF-8 bytes for payloads that break `to: "string"` parsing.
    var inflatedBytes = pako.inflate(bytes);
    var decoder = new TextDecoder("utf-8");
    var text = decoder.decode(inflatedBytes);
    return JSON.parse(String(text).trim());
  }
}

export function decodePacketMatrix(packet) {
  if (!packet || typeof packet !== "object") {
    return packet;
  }

  if (Array.isArray(packet.data)) {
    return packet;
  }

  packet.data = decodeCompressedMatrixPayload(packet.data);
  return packet;
}

export function decodePacketsMatrix(packets) {
  if (!Array.isArray(packets)) {
    return [];
  }

  var decoded = [];
  for (var i = 0; i < packets.length; i += 1) {
    decoded.push(decodePacketMatrix(packets[i]));
  }
  return decoded;
}
