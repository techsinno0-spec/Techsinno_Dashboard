const axios = require('axios');
const FormData = require('form-data');

const LINKEDIN_VERSION = '202502';

async function uploadLinkedInImage(accessToken, authorUrn, imageBuffer) {
  const initRes = await axios.post('https://api.linkedin.com/rest/images?action=initializeUpload',
    { initializeUploadRequest: { owner: authorUrn } },
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'LinkedIn-Version': LINKEDIN_VERSION } }
  );
  const { uploadUrl, image } = initRes.data.value;
  await axios.put(uploadUrl, imageBuffer, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }
  });
  return image;
}

async function postToLinkedIn(accessToken, authorUrn, text, imageUrl, mediaData) {
  console.log('[LinkedIn Post] Posting with author:', authorUrn);

  // Try the versioned REST API first
  try {
    const restBody = {
      author: authorUrn,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED'
    };

    if (mediaData && mediaData.base64 && mediaData.mimeType?.startsWith('image/')) {
      const buf = Buffer.from(mediaData.base64, 'base64');
      const imageUrn = await uploadLinkedInImage(accessToken, authorUrn, buf);
      restBody.content = { media: { id: imageUrn } };
    } else if (imageUrl) {
      restBody.content = { article: { source: imageUrl, title: text.substring(0, 200) } };
    }

    const res = await axios.post('https://api.linkedin.com/rest/posts', restBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });
    const postId = res.headers?.['x-restli-id'] || res.headers?.['x-linkedin-id'] || null;
    console.log('[LinkedIn Post] REST API success:', res.status, 'postId:', postId, 'headers:', JSON.stringify(res.headers));
    return { success: true, platform: 'linkedin', postId, api: 'rest' };
  } catch (restErr) {
    console.log('[LinkedIn Post] REST API failed:', restErr.response?.status, JSON.stringify(restErr.response?.data));

    // Fallback to legacy UGC Posts API
    console.log('[LinkedIn Post] Trying legacy /v2/ugcPosts...');
    const ugcBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    };

    if (imageUrl) {
      ugcBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
      ugcBody.specificContent['com.linkedin.ugc.ShareContent'].media = [{
        status: 'READY',
        originalUrl: imageUrl,
        description: { text: text.substring(0, 200) }
      }];
    }

    try {
      const res = await axios.post('https://api.linkedin.com/v2/ugcPosts', ugcBody, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      const postId = res.data?.id || null;
      console.log('[LinkedIn Post] UGC API success:', res.status, 'postId:', postId);
      return { success: true, platform: 'linkedin', postId, api: 'ugc' };
    } catch (ugcErr) {
      console.log('[LinkedIn Post] UGC API also failed:', ugcErr.response?.status, JSON.stringify(ugcErr.response?.data));
      throw ugcErr;
    }
  }
}

async function postToFacebook(pageAccessToken, pageId, text, imageUrl, mediaData) {
  if (mediaData && mediaData.base64) {
    const buf = Buffer.from(mediaData.base64, 'base64');
    if (mediaData.mimeType?.startsWith('video/')) {
      const form = new FormData();
      form.append('description', text);
      form.append('source', buf, { filename: mediaData.name || 'video.mp4', contentType: mediaData.mimeType });
      form.append('access_token', pageAccessToken);
      const res = await axios.post(`https://graph-video.facebook.com/v19.0/${pageId}/videos`, form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity });
      return { success: true, platform: 'facebook', postId: res.data.id };
    } else {
      const form = new FormData();
      form.append('message', text);
      form.append('source', buf, { filename: mediaData.name || 'image.jpg', contentType: mediaData.mimeType });
      form.append('access_token', pageAccessToken);
      const res = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/photos`, form, { headers: form.getHeaders() });
      return { success: true, platform: 'facebook', postId: res.data.id };
    }
  }

  let url, params;
  if (imageUrl) {
    url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
    params = { message: text, url: imageUrl, access_token: pageAccessToken };
  } else {
    url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    params = { message: text, access_token: pageAccessToken };
  }
  const res = await axios.post(url, null, { params });
  return { success: true, platform: 'facebook', postId: res.data.id };
}

async function uploadToFacebookTemp(pageAccessToken, pageId, imageBuffer, mimeType, filename) {
  const form = new FormData();
  form.append('source', imageBuffer, { filename: filename || 'image.jpg', contentType: mimeType });
  form.append('published', 'false');
  form.append('access_token', pageAccessToken);
  const res = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/photos`, form, { headers: form.getHeaders() });
  const photoId = res.data.id;
  const photoRes = await axios.get(`https://graph.facebook.com/v19.0/${photoId}`, {
    params: { fields: 'images', access_token: pageAccessToken }
  });
  return photoRes.data.images?.[0]?.source || null;
}

async function postToInstagram(pageAccessToken, igUserId, text, imageUrl, mediaData, pageId) {
  if (mediaData && mediaData.base64 && mediaData.mimeType?.startsWith('video/')) {
    const buf = Buffer.from(mediaData.base64, 'base64');
    const tempUrl = await uploadToFacebookTemp(pageAccessToken, pageId, buf, mediaData.mimeType, mediaData.name);
    if (!tempUrl) throw new Error('Could not upload video for Instagram');
    const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${igUserId}/media`, null,
      { params: { media_type: 'REELS', video_url: tempUrl, caption: text, access_token: pageAccessToken } }
    );
    const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, null,
      { params: { creation_id: containerRes.data.id, access_token: pageAccessToken } }
    );
    return { success: true, platform: 'instagram', postId: publishRes.data.id };
  }

  if (mediaData && mediaData.base64 && mediaData.mimeType?.startsWith('image/')) {
    const buf = Buffer.from(mediaData.base64, 'base64');
    const tempUrl = await uploadToFacebookTemp(pageAccessToken, pageId, buf, mediaData.mimeType, mediaData.name);
    if (!tempUrl) throw new Error('Could not upload image for Instagram');
    imageUrl = tempUrl;
  }

  if (!imageUrl) {
    return { success: false, platform: 'instagram', error: 'Instagram requires an image' };
  }
  const containerRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igUserId}/media`, null,
    { params: { image_url: imageUrl, caption: text, access_token: pageAccessToken } }
  );
  const publishRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish`, null,
    { params: { creation_id: containerRes.data.id, access_token: pageAccessToken } }
  );
  return { success: true, platform: 'instagram', postId: publishRes.data.id };
}

async function refreshLinkedInToken(clientId, clientSecret, refreshToken) {
  const res = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }
  });
  return res.data;
}

async function getLongLivedMetaToken(appId, appSecret, shortToken) {
  const res = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken
    }
  });
  return res.data.access_token;
}

module.exports = { postToLinkedIn, postToFacebook, postToInstagram, refreshLinkedInToken, getLongLivedMetaToken };
