const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, zohoGet } = require('../../shared/email');

const ZOHO_ALIAS_RECIPIENTS = [
  'frank@techsinno.com',
  'info@techsinno.com',
  'sales@techsinno.com'
];
const GMAIL_MESSAGE_LIMIT = 50;
const GMAIL_SCAN_LIMIT = 200;
const OUTLOOK_MESSAGE_LIMIT = 50;
const ZOHO_PAGE_SIZE = 50;
const ZOHO_ALL_SCAN_LIMIT = 250;
const ZOHO_ALIAS_SCAN_LIMIT = 500;
const ZOHO_ALIAS_DETAIL_SCAN_LIMIT = 180;
const ZOHO_INBOX_FOLDER_SCAN_LIMIT = 18;

function mailJsonResponse(body, status = 200) {
  const response = jsonResponse(body, status);
  response.headers = {
    ...response.headers,
    'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  };
  return response;
}

function upstreamMailError(err) {
  const data = err?.response?.data;
  const nested = data?.error;
  let message = '';

  if (nested && typeof nested === 'object') {
    message = nested.message || nested.status || nested.code || '';
  } else if (typeof nested === 'string') {
    message = nested;
  }

  message = message ||
    data?.error_description ||
    data?.message ||
    (typeof data === 'string' ? data : '') ||
    err?.message ||
    'Failed to load mail';

  return err?.response?.status ? `${message} (${err.response.status})` : message;
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...await Promise.all(chunk.map(mapper)));
  }
  return results;
}

async function gmailListMessagesSafely(cfg, wantedLabel) {
  try {
    return {
      listRes: await gmailGet(cfg, '/messages', { maxResults: GMAIL_SCAN_LIMIT, labelIds: wantedLabel }),
      scoped: true
    };
  } catch (err) {
    return {
      listRes: await gmailGet(cfg, '/messages', { maxResults: GMAIL_SCAN_LIMIT }),
      scoped: false,
      fallbackReason: upstreamMailError(err)
    };
  }
}

// Detect a real file attachment in a Gmail metadata payload (parts carry a filename)
function gmailHasAttachment(payload) {
  const walk = (part) => {
    if (!part) return false;
    if (part.filename && part.filename.trim() && (part.body?.attachmentId || part.body?.size)) return true;
    return (part.parts || []).some(walk);
  };
  return !!payload && (payload.parts || []).some(walk);
}

function extractAddressParts(value) {
  if (!value) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(extractAddressParts);
  if (typeof value === 'object') {
    return [
      value.address,
      value.email,
      value.emailAddress,
      value.mail,
      value.name,
      value.displayName,
      value.fromAddress,
      value.toAddress,
      value.value,
      value.headerValue
    ].flatMap(extractAddressParts);
  }
  return [];
}

function zohoAddressText(...values) {
  return values.flatMap(extractAddressParts).filter(Boolean).join(', ');
}

function zohoAddressSearchText(...values) {
  return zohoAddressText(...values).toLowerCase();
}

function zohoNamedHeaderAddressText(headers) {
  const wanted = new Set(['to', 'cc', 'bcc', 'delivered-to', 'x-original-to', 'envelope-to']);
  const list = Array.isArray(headers) ? headers : [];
  return list
    .filter(h => wanted.has(String(h?.name || h?.key || '').toLowerCase()))
    .map(h => h.value || h.headerValue || '')
    .filter(Boolean)
    .join(', ');
}

function zohoRawHeaderAddressText(...values) {
  return values
    .map(value => String(value || '').match(/^(to|cc|bcc|delivered-to|x-original-to|envelope-to):[^\r\n]+/gim) || [])
    .flat()
    .join('\n');
}

function zohoRecipientText(message) {
  return zohoAddressSearchText(
    message.toAddress,
    message.ccAddress,
    message.bccAddress,
    message.recipientAddress,
    message.deliveredTo,
    message.originalRecipient,
    message.to,
    message.cc,
    message.bcc,
    message.recipients,
    zohoNamedHeaderAddressText(message.headers || message.header || message.messageHeaders),
    zohoRawHeaderAddressText(message.raw, message.rawContent, message.headerContent, message.content, message.body)
  );
}

function zohoMessageId(message) {
  return message?.messageId || message?.mailId || message?.id || '';
}

function newestMessageTime(message) {
  const raw =
    message.receivedTime ||
    message.sentDateInGMT ||
    message.date ||
    message.receivedDateTime ||
    message.sentDateTime ||
    message.internalDate ||
    0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(a, b) {
  return newestMessageTime(b) - newestMessageTime(a);
}

function zohoFolderList(folders) {
  return Array.isArray(folders?.data) ? folders.data.filter(f => f?.folderId || f?.folderName || f?.path) : [];
}

function normalizeZohoFolderValue(value) {
  return String(value || '').toLowerCase().replace(/^[\\/]+|[\\/]+$/g, '').trim();
}

function zohoFolderValues(folder) {
  return [folder?.folderName, folder?.path, folder?.folderType]
    .map(normalizeZohoFolderValue)
    .filter(Boolean);
}

function zohoFolderLabel(folder) {
  return String(folder?.folderName || folder?.path || folder?.folderType || folder?.folderId || 'All mail');
}

function zohoFolderText(folder) {
  return zohoFolderValues(folder).join(' ');
}

function zohoFolderMatchesAny(folder, wanted) {
  return zohoFolderValues(folder).some(value => (
    wanted.includes(value) ||
    value.split(/[\\/]/).some(part => wanted.includes(part))
  ));
}

function findMailFolder(folders, folder) {
  const list = zohoFolderList(folders);
  const wanted = folder === 'sent' ? ['sent', 'sent items', 'sent mail'] : ['inbox'];
  return list.find(f => zohoFolderMatchesAny(f, wanted));
}

function isZohoAliasCandidateFolder(folder) {
  const excluded = ['sent', 'sent items', 'sent mail', 'draft', 'drafts', 'trash', 'bin', 'spam', 'junk', 'outbox', 'template', 'templates'];
  return !zohoFolderValues(folder).some(value => (
    excluded.includes(value) ||
    value.split(/[\\/]/).some(part => excluded.includes(part))
  ));
}

function selectZohoFolders(folders, folder, recipientFilter) {
  const list = zohoFolderList(folders);
  const selected = [];
  const seen = new Set();
  const add = (target) => {
    if (!target) return;
    const key = String(target.folderId || zohoFolderLabel(target)).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    selected.push(target);
  };

  add(findMailFolder(folders, folder));
  if (folder === 'sent') return selected;

  const localPart = recipientFilter ? recipientFilter.split('@')[0].toLowerCase() : '';
  if (localPart) {
    list
      .filter(f => zohoFolderText(f).includes(localPart))
      .forEach(add);
  }
  list
    .filter(isZohoAliasCandidateFolder)
    .forEach(add);

  return selected.slice(0, ZOHO_INBOX_FOLDER_SCAN_LIMIT);
}

function sampleZohoRecipients(messages, limit = 6) {
  const seen = new Set();
  const samples = [];
  for (const message of messages) {
    const value = zohoAddressText(message.toAddress, message.to, message.recipientAddress, message.recipients).trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(value.length > 90 ? `${value.slice(0, 87)}...` : value);
    if (samples.length >= limit) break;
  }
  return samples;
}

function zohoRecipientWarning(recipientFilter, allMsgs, filterResult, recipientKnownToZoho, folderNamesScanned, recipientSamples) {
  const folders = folderNamesScanned.length
    ? ` Folders scanned: ${folderNamesScanned.slice(0, 8).join(', ')}${folderNamesScanned.length > 8 ? ` +${folderNamesScanned.length - 8} more` : ''}.`
    : '';
  const samples = recipientSamples.length
    ? ` Recent To values seen: ${recipientSamples.join(' | ')}.`
    : '';
  return `${recipientFilter} did not appear in Zoho recipient metadata after scanning ${allMsgs.length} messages and checking ${filterResult.detailScannedCount} message details.${folders}${samples}${recipientKnownToZoho ? '' : ' Zoho did not return this address as an API-visible account/alias for the connected user.'}`;
}

function zohoAccountRecipientText(account) {
  const aliases = Array.isArray(account?.sendMailDetails) ? account.sendMailDetails : [];
  const emailAddresses = Array.isArray(account?.emailAddress) ? account.emailAddress : [];
  return zohoAddressSearchText(
    account?.primaryEmailAddress,
    account?.emailAddress,
    account?.accountDisplayName,
    account?.mailboxAddress,
    account?.incomingUserName,
    ...aliases.map(a => a.fromAddress),
    ...emailAddresses.map(a => a.mailId || a.emailAddress || a.address)
  );
}

async function getZohoMailAccounts(cfg) {
  try {
    const data = await zohoGet(cfg, '/accounts');
    const accounts = Array.isArray(data.data) ? data.data.filter(a => a?.accountId) : [];
    if (accounts.length) return accounts;
  } catch {}

  if (Array.isArray(cfg.accounts) && cfg.accounts.some(a => a?.accountId)) {
    return cfg.accounts.filter(a => a?.accountId).map(a => ({
      accountId: a.accountId,
      primaryEmailAddress: a.primaryEmailAddress || a.email,
      emailAddress: a.email,
      accountDisplayName: a.name,
      sendMailDetails: Array.isArray(a.aliases)
        ? a.aliases.map(alias => ({ fromAddress: alias.address, displayName: alias.name }))
        : []
    }));
  }

  return [{
    accountId: cfg.accountId,
    primaryEmailAddress: cfg.email,
    sendMailDetails: Array.isArray(cfg.aliases)
      ? cfg.aliases.map(a => ({ fromAddress: a.address, displayName: a.name }))
      : []
  }].filter(a => a.accountId);
}

async function fetchZohoMessageSource(cfg, path, baseParams, folderId, maxToScan) {
  const messages = [];
  const seen = new Set();

  for (let page = 0; page < Math.ceil(maxToScan / ZOHO_PAGE_SIZE); page++) {
    const params = {
      ...baseParams,
      limit: ZOHO_PAGE_SIZE,
      includeto: true
    };
    if (page > 0) params.start = page * ZOHO_PAGE_SIZE + 1;

    let data;
    try {
      data = await zohoGet(cfg, path, params);
    } catch (err) {
      if (messages.length) break;
      throw err;
    }
    const pageMessages = Array.isArray(data.data) ? data.data : [];
    if (!pageMessages.length) break;

    const before = seen.size;
    pageMessages.forEach(message => {
      const id = zohoMessageId(message);
      if (!id || seen.has(id)) return;
      seen.add(id);
      messages.push({ ...message, folderId: message.folderId || folderId });
    });

    if (pageMessages.length < ZOHO_PAGE_SIZE) break;
    if (seen.size === before) break;
  }

  return messages;
}

async function fetchZohoMessages(cfg, accountId, folderId, maxToScan) {
  const sources = folderId
    ? [
        { path: `/accounts/${accountId}/folders/${folderId}/messages/view`, params: {} },
        { path: `/accounts/${accountId}/messages/view`, params: { folderId } }
      ]
    : [{ path: `/accounts/${accountId}/messages/view`, params: {} }];

  const messages = [];
  const seen = new Set();
  let sourceError = null;

  for (const source of sources) {
    try {
      const sourceMessages = await fetchZohoMessageSource(cfg, source.path, source.params, folderId, maxToScan);
      sourceMessages.forEach(message => {
        const id = zohoMessageId(message);
        if (!id || seen.has(id)) return;
        seen.add(id);
        messages.push(message);
      });
    } catch (err) {
      sourceError = sourceError || err;
    }
  }

  if (!messages.length && sourceError) throw sourceError;
  return messages.sort(newestFirst).slice(0, maxToScan);
}

async function fetchZohoMessageDetail(cfg, accountId, folderId, messageId) {
  const paths = [];
  if (folderId) {
    paths.push(
      `/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`,
      `/accounts/${accountId}/folders/${folderId}/messages/${messageId}`
    );
  }
  paths.push(
    `/accounts/${accountId}/messages/${messageId}/content`,
    `/accounts/${accountId}/messages/${messageId}`
  );

  const tried = new Set();
  for (const path of paths) {
    if (tried.has(path)) continue;
    tried.add(path);
    try {
      const data = await zohoGet(cfg, path);
      return data.data || data;
    } catch {}
  }
  return null;
}

async function filterZohoRecipientMessages(cfg, allMsgs, recipientFilter) {
  if (!recipientFilter) {
    return { messages: allMsgs, metadataMatchedCount: allMsgs.length, detailScannedCount: 0, detailMatchedCount: 0 };
  }

  const metadataMatches = [];
  const detailCandidates = [];

  allMsgs.forEach(message => {
    if (zohoRecipientText(message).includes(recipientFilter)) metadataMatches.push(message);
    else detailCandidates.push(message);
  });

  const detailScan = detailCandidates.slice(0, ZOHO_ALIAS_DETAIL_SCAN_LIMIT);
  const detailMatches = (await mapLimit(detailScan, 6, async message => {
    const id = zohoMessageId(message);
    if (!id) return null;
    const detail = await fetchZohoMessageDetail(cfg, message.accountId || cfg.accountId, message.folderId || '', id);
    if (!detail) return null;
    const detailText = zohoRecipientText(detail);
    if (!detailText.includes(recipientFilter)) return null;
    return {
      ...message,
      toAddress: message.toAddress || detail.toAddress || detail.to,
      ccAddress: message.ccAddress || detail.ccAddress || detail.cc,
      bccAddress: message.bccAddress || detail.bccAddress || detail.bcc,
      recipientAddress: message.recipientAddress || detail.recipientAddress,
      recipients: message.recipients || detail.recipients
    };
  })).filter(Boolean);

  const seen = new Set();
  const messages = [...metadataMatches, ...detailMatches]
    .filter(message => {
      const key = `${message.accountId || ''}:${message.folderId || ''}:${zohoMessageId(message)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(newestFirst);

  return {
    messages,
    metadataMatchedCount: metadataMatches.length,
    detailScannedCount: detailScan.length,
    detailMatchedCount: detailMatches.length
  };
}

app.http('email-inbox', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/inbox/{provider}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const provider = request.params.provider;
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder') || 'inbox';
    const recipient = (url.searchParams.get('recipient') || '').trim().toLowerCase();

    try {
      if (provider === 'gmail') {
        const cfg = await getEmailConfig('gmail');
        if (!cfg?.accessToken) return badRequest('Gmail not connected');

        const wantedLabel = folder === 'sent' ? 'SENT' : 'INBOX';
        const [profile, listResult] = await Promise.all([
          gmailGet(cfg, '/profile').catch(() => null),
          gmailListMessagesSafely(cfg, wantedLabel)
        ]);

        const listRes = listResult.listRes || {};
        const msgIds = (listRes.messages || []).slice(0, GMAIL_SCAN_LIMIT);
        const msgs = (await mapLimit(msgIds, 10, async m => {
          try {
            return await gmailGet(cfg, `/messages/${m.id}`, { format: 'metadata' });
          } catch {
            return null;
          }
        })).filter(Boolean);
        const sorted = msgs
          .filter(m => (m.labelIds || []).includes(wantedLabel))
          .sort(newestFirst)
          .slice(0, GMAIL_MESSAGE_LIMIT);

        return mailJsonResponse({
          success: true,
          email: profile?.emailAddress || cfg.email,
          scannedCount: msgs.length,
          scanMode: listResult.scoped ? 'label' : 'fallback',
          warning: listResult.fallbackReason ? `Gmail folder-scoped scan failed; loaded fallback recent mail: ${listResult.fallbackReason}` : undefined,
          unreadCount: folder === 'inbox' ? sorted.filter(m => (m.labelIds || []).includes('UNREAD')).length : 0,
          messages: sorted.map(m => {
            const h = {};
            (m.payload?.headers || []).forEach(x => { h[x.name] = x.value; });
            return { id: m.id, subject: h.Subject || '(no subject)', from: h.From || '', to: h.To || '', date: h.Date || '', unread: (m.labelIds || []).includes('UNREAD'), hasAttachment: gmailHasAttachment(m.payload) };
          })
        });
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        if (!cfg?.accessToken) return badRequest('Outlook not connected');

        if (folder === 'sent') {
          const msgs = await msGet(cfg, '/me/mailFolders/SentItems/messages', {
            '$select': 'subject,toRecipients,from,sentDateTime,hasAttachments', '$top': OUTLOOK_MESSAGE_LIMIT, '$orderby': 'sentDateTime desc'
          });
          return mailJsonResponse({
            success: true,
            email: cfg.email,
            messages: (msgs.value || []).map(m => ({
              id: m.id, subject: m.subject || '(no subject)',
              to: (m.toRecipients || []).map(r => r.emailAddress?.address || '').join(', '),
              from: m.from?.emailAddress?.address || '', date: m.sentDateTime,
              hasAttachment: !!m.hasAttachments
            }))
          });
        }

        const [msFolder, msgs] = await Promise.all([
          msGet(cfg, '/me/mailFolders/Inbox'),
          msGet(cfg, '/me/mailFolders/Inbox/messages', { '$select': 'subject,from,receivedDateTime,isRead,hasAttachments', '$top': OUTLOOK_MESSAGE_LIMIT, '$orderby': 'receivedDateTime desc' })
        ]);
        const sorted = (msgs.value || []).sort(newestFirst);
        return mailJsonResponse({
          success: true,
          email: cfg.email,
          unreadCount: msFolder.unreadItemCount || 0,
          messages: sorted.map(m => ({
            id: m.id, subject: m.subject || '(no subject)',
            from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
            date: m.receivedDateTime, unread: !m.isRead,
            hasAttachment: !!m.hasAttachments
          }))
        });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');
        const recipientFilter = ZOHO_ALIAS_RECIPIENTS.includes(recipient) ? recipient : '';

        const scanLimit = recipientFilter ? ZOHO_ALIAS_SCAN_LIMIT : ZOHO_ALL_SCAN_LIMIT;
        const accounts = await getZohoMailAccounts(cfg);
        const targetAccounts = recipientFilter
          ? accounts.filter(a => zohoAccountRecipientText(a).includes(recipientFilter))
          : accounts;
        const accountsToScan = targetAccounts.length ? targetAccounts : accounts;
        const perAccountLimit = Math.max(ZOHO_PAGE_SIZE, Math.ceil(scanLimit / Math.max(1, accountsToScan.length)));
        const allMsgs = [];
        const allSeen = new Set();
        const folderNamesScanned = [];
        const folderNameSeen = new Set();
        let accountError = null;

        for (const account of accountsToScan) {
          let foldersToScan = [];
          try {
            const folders = await zohoGet(cfg, `/accounts/${account.accountId}/folders`);
            foldersToScan = selectZohoFolders(folders, folder, recipientFilter);
          } catch {}

          if (!foldersToScan.length && folder !== 'sent') {
            foldersToScan = [{ folderId: '', folderName: 'All mail' }];
          }
          if (folder === 'sent' && !foldersToScan.length) continue;

          const perFolderLimit = Math.max(ZOHO_PAGE_SIZE, Math.ceil(perAccountLimit / Math.max(1, foldersToScan.length)));
          for (const target of foldersToScan) {
            const folderId = target.folderId || '';
            const folderLabel = zohoFolderLabel(target);
            const folderKey = `${account.accountId}:${folderId || folderLabel}`.toLowerCase();
            if (!folderNameSeen.has(folderKey)) {
              folderNameSeen.add(folderKey);
              folderNamesScanned.push(folderLabel);
            }

            try {
              const accountMsgs = await fetchZohoMessages(cfg, account.accountId, folderId, perFolderLimit);
              accountMsgs.forEach(m => {
                const id = zohoMessageId(m);
                const msgFolderId = m.folderId || folderId || '';
                const key = `${account.accountId}:${msgFolderId}:${id}`;
                if (!id || allSeen.has(key)) return;
                allSeen.add(key);
                allMsgs.push({
                  ...m,
                  accountId: account.accountId,
                  folderId: msgFolderId,
                  folderName: m.folderName || folderLabel
                });
              });
            } catch (err) {
              accountError = accountError || err;
            }
          }
        }

        if (!allMsgs.length && accountError) throw accountError;
        allMsgs.sort(newestFirst);
        const filterResult = await filterZohoRecipientMessages(cfg, allMsgs, recipientFilter);
        const msgs = filterResult.messages;
        const recipientSamples = recipientFilter ? sampleZohoRecipients(allMsgs) : [];
        const recipientKnownToZoho = recipientFilter
          ? accounts.some(a => zohoAccountRecipientText(a).includes(recipientFilter)) ||
            zohoAddressSearchText(...(Array.isArray(cfg.aliases) ? cfg.aliases.map(a => a.address) : [])).includes(recipientFilter)
          : true;

        return mailJsonResponse({
          success: true,
          email: cfg.email,
          recipient: recipientFilter,
          scannedCount: allMsgs.length,
          accountsScanned: accountsToScan.length,
          foldersScanned: folderNamesScanned.length,
          folderNamesScanned,
          recipientSamples,
          metadataMatchedCount: filterResult.metadataMatchedCount,
          detailScannedCount: filterResult.detailScannedCount,
          detailMatchedCount: filterResult.detailMatchedCount,
          warning: recipientFilter && !msgs.length
            ? zohoRecipientWarning(recipientFilter, allMsgs, filterResult, recipientKnownToZoho, folderNamesScanned, recipientSamples)
            : undefined,
          unreadCount: folder === 'inbox' ? msgs.filter(m => !m.isRead).length : 0,
          messages: msgs.slice(0, recipientFilter ? 80 : 60).map(m => ({
            id: zohoMessageId(m), subject: m.subject || '(no subject)',
            from: zohoAddressText(m.fromAddress, m.from) || '',
            to: zohoAddressText(m.toAddress, m.to, m.recipientAddress, m.recipients) || '',
            date: m.receivedTime ? new Date(parseInt(m.receivedTime)).toISOString() : '',
            unread: !m.isRead,
            folderId: m.folderId || '',
            accountId: m.accountId || cfg.accountId || '',
            hasAttachment: !!(m.hasAttachment || m.attachmentCount || m.attachments?.length)
          }))
        });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      const labels = { gmail: 'Gmail', outlook: 'Outlook', zoho_mail: 'Zoho Mail' };
      return mailJsonResponse({ error: `${labels[provider] || 'Mail'}: ${upstreamMailError(err)}` }, 500);
    }
  }
});
