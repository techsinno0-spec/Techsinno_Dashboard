const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, isManagerOrOwner } = require('../../shared/auth');
const { getOneDriveConfig, uploadOneDriveBuffer, ONEDRIVE_DEFAULT_FOLDER } = require('../../shared/onedrive');

function decodeBase64Payload(value) {
  const raw = String(value || '');
  const b64 = raw.includes(',') ? raw.split(',').pop() : raw;
  return Buffer.from(b64, 'base64');
}

app.http('onedrive-upload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'onedrive/upload',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isManagerOrOwner(decoded)) return forbidden();

    try {
      const body = await request.json();
      const name = String(body.name || '').trim();
      const data = body.data || body.base64;
      if (!name) return badRequest('File name is required');
      if (!data) return badRequest('File data is required');

      const cfg = await getOneDriveConfig();
      if (!cfg?.refreshToken && !cfg?.accessToken) return badRequest('OneDrive is not connected');

      const item = await uploadOneDriveBuffer(cfg, {
        filename: name,
        folder: body.folder || ONEDRIVE_DEFAULT_FOLDER,
        contentType: body.contentType || 'application/octet-stream',
        buffer: decodeBase64Payload(data)
      });

      return jsonResponse({ success: true, item });
    } catch (err) {
      return jsonResponse({ error: err.response?.data?.error?.message || err.message || 'OneDrive upload failed' }, 500);
    }
  }
});
