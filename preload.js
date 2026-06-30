const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('techsinno', {
  // Auth
  authLogin:         (u, p) => ipcRenderer.invoke('auth-login', u, p),
  authLogout:        ()     => ipcRenderer.invoke('auth-logout'),
  authGetUser:       ()     => ipcRenderer.invoke('auth-get-user'),
  authGetApiBase:    ()     => ipcRenderer.invoke('auth-get-api-base'),
  authSetApiBase:    (url)  => ipcRenderer.invoke('auth-set-api-base', url),
  authChangePassword:(c, n) => ipcRenderer.invoke('auth-change-password', c, n),
  // API proxy (calls Azure Functions)
  apiCall:           (method, path, body) => ipcRenderer.invoke('api-call', method, path, body),
  cloudConfigGet:    (service) => ipcRenderer.invoke('cloud-config-get', service),
  cloudConfigSave:   (service, body) => ipcRenderer.invoke('cloud-config-save', service, body),
  cloudConfigList:   () => ipcRenderer.invoke('cloud-config-list'),
  stateLoad:         (key) => ipcRenderer.invoke('state-load', key),
  stateSave:         (key, value) => ipcRenderer.invoke('state-save', key, value),
  // Zoho
  getZohoConfig:     ()      => ipcRenderer.invoke('get-zoho-config'),
  saveZohoConfig:    (cfg)   => ipcRenderer.invoke('save-zoho-config', cfg),
  zohoConnect:       ()      => ipcRenderer.invoke('zoho-connect'),
  zohoDisconnect:    ()      => ipcRenderer.invoke('zoho-disconnect'),
  zohoGetDashboard:  ()      => ipcRenderer.invoke('zoho-get-dashboard'),
  // Store
  storeGet:          (key)   => ipcRenderer.invoke('store-get', key),
  storeSet:          (k, v)  => ipcRenderer.invoke('store-set', k, v),
  // Utilities
  openUrl:           (u)     => ipcRenderer.invoke('open-url', u),
  // Gmail
  gmailGetConfig:    ()      => ipcRenderer.invoke('gmail-get-config'),
  gmailSaveConfig:   (cfg)   => ipcRenderer.invoke('gmail-save-config', cfg),
  gmailConnect:      ()      => ipcRenderer.invoke('gmail-connect'),
  gmailDisconnect:   ()      => ipcRenderer.invoke('gmail-disconnect'),
  gmailGetInbox:     ()      => ipcRenderer.invoke('gmail-get-inbox'),
  gmailGetSent:      ()      => ipcRenderer.invoke('gmail-get-sent'),
  gmailAiScan:       ()      => ipcRenderer.invoke('gmail-ai-scan'),
  gmailGetMessage:   (id)    => ipcRenderer.invoke('gmail-get-message', id),
  gmailGetAttachment:(msgId, attId) => ipcRenderer.invoke('gmail-get-attachment', msgId, attId),
  gmailAnalyzeInbox: ()      => ipcRenderer.invoke('gmail-analyze-inbox'),
  gmailSend:         (msg)   => ipcRenderer.invoke('gmail-send', msg),
  gmailOpenCompose:  (opts)  => ipcRenderer.invoke('gmail-open-compose', opts),
  // Outlook / Microsoft Graph
  msGetConfig:       ()      => ipcRenderer.invoke('ms-get-config'),
  msSaveConfig:      (cfg)   => ipcRenderer.invoke('ms-save-config', cfg),
  msConnect:         ()      => ipcRenderer.invoke('ms-connect'),
  msDisconnect:      ()      => ipcRenderer.invoke('ms-disconnect'),
  msGetInbox:        ()      => ipcRenderer.invoke('ms-get-inbox'),
  msGetSent:         ()      => ipcRenderer.invoke('ms-get-sent'),
  msAiScan:          ()      => ipcRenderer.invoke('ms-ai-scan'),
  msGetMessage:      (id)    => ipcRenderer.invoke('ms-get-message', id),
  msGetAttachment:   (msgId, attId) => ipcRenderer.invoke('ms-get-attachment', msgId, attId),
  msSend:            (msg)   => ipcRenderer.invoke('ms-send', msg),
  msOpenCompose:     (opts)  => ipcRenderer.invoke('ms-open-compose', opts),
  // Claude AI
  claudeGetKey:      ()         => ipcRenderer.invoke('claude-get-key'),
  claudeSaveKey:     (key)      => ipcRenderer.invoke('claude-save-key', key),
  claudeChat:        (payload)  => ipcRenderer.invoke('claude-chat', payload),
  // OneDrive sync
  odGetConfig:       ()      => ipcRenderer.invoke('od-get-config'),
  odSaveConfig:      (cfg)   => ipcRenderer.invoke('od-save-config', cfg),
  odConnect:         ()      => ipcRenderer.invoke('od-connect'),
  odDisconnect:      ()      => ipcRenderer.invoke('od-disconnect'),
  syncGetInfo:       ()      => ipcRenderer.invoke('sync-get-info'),
  syncSave:          (data)  => ipcRenderer.invoke('sync-save', data),
  syncLoad:          ()      => ipcRenderer.invoke('sync-load'),
  // Hunter.io
  hunterGetKey:      ()          => ipcRenderer.invoke('hunter-get-key'),
  hunterSaveKey:     (key)       => ipcRenderer.invoke('hunter-save-key', key),
  hunterSearch:      (domain)    => ipcRenderer.invoke('hunter-search', domain),
  // AI Outreach Agent
  agentGetQueue:     ()      => ipcRenderer.invoke('agent-get-queue'),
  agentRunScan:      ()      => ipcRenderer.invoke('agent-run-scan'),
  agentApprove:      (item)  => ipcRenderer.invoke('agent-approve', item),
  agentDismiss:      (id)    => ipcRenderer.invoke('agent-dismiss', id),
  agentClearHistory: ()      => ipcRenderer.invoke('agent-clear-history'),
  // Zoho Mail (frank@techsinno.com)
  zohomailGetConfig:     ()      => ipcRenderer.invoke('zohomail-get-config'),
  zohomailSaveConfig:    (cfg)   => ipcRenderer.invoke('zohomail-save-config', cfg),
  zohomailConnect:       ()      => ipcRenderer.invoke('zohomail-connect'),
  zohomailSetRegion:     (r)     => ipcRenderer.invoke('zohomail-set-region', r),
  zohomailDisconnect:    ()      => ipcRenderer.invoke('zohomail-disconnect'),
  zohomailGetInbox:      ()      => ipcRenderer.invoke('zohomail-get-inbox'),
  zohomailGetSent:       ()      => ipcRenderer.invoke('zohomail-get-sent'),
  zohomailGetMessage:    (id)    => ipcRenderer.invoke('zohomail-get-message', id),
  zohomailGetAttachment: (msgId, attId, folderId) => ipcRenderer.invoke('zohomail-get-attachment', msgId, attId, folderId),
  zohomailSend:          (msg)   => ipcRenderer.invoke('zohomail-send', msg),
  zohomailAnalyzeInbox:  ()      => ipcRenderer.invoke('zohomail-analyze-inbox'),
  // Cloudflare Analytics
  cfGetConfig:           ()      => ipcRenderer.invoke('cf-get-config'),
  cfSaveConfig:          (cfg)   => ipcRenderer.invoke('cf-save-config', cfg),
  cfGetTraffic:          ()      => ipcRenderer.invoke('cf-get-traffic'),
  // Website services
  fetchWebsiteJobs:      ()      => ipcRenderer.invoke('fetch-website-jobs'),
  // LinkedIn
  liGetConfig:       ()      => ipcRenderer.invoke('li-get-config'),
  liSaveConfig:      (cfg)   => ipcRenderer.invoke('li-save-config', cfg),
  liConnect:         ()      => ipcRenderer.invoke('li-connect'),
  liDisconnect:      ()      => ipcRenderer.invoke('li-disconnect'),
  liGetStats:        ()      => ipcRenderer.invoke('li-get-stats'),
  // Agent reset
  agentReset:        ()      => ipcRenderer.invoke('agent-reset'),
  // File pickers & attachments
  pickMediaFile:     (type)  => ipcRenderer.invoke('pick-media-file', type),
  pickEmailAttachments: ()   => ipcRenderer.invoke('pick-email-attachments'),
  saveAttachment:    (name, data) => ipcRenderer.invoke('save-attachment', name, data),
  // Manual tasks
  manualTasksGet:    ()           => ipcRenderer.invoke('manual-tasks-get'),
  manualTasksUpsert: (task)       => ipcRenderer.invoke('manual-tasks-upsert', task),
  manualTasksDelete: (id)         => ipcRenderer.invoke('manual-tasks-delete', id),
  // Job cards
  zohoGetQuotes:     ()           => ipcRenderer.invoke('zoho-get-quotes'),
  jobCardCreate:     (opts)       => ipcRenderer.invoke('job-card-create', opts),
  jobCardCreateManual:(payload)   => ipcRenderer.invoke('job-card-create-manual', payload),
  jobCardsGet:       ()           => ipcRenderer.invoke('job-cards-get'),
  jobCardDelete:     (id)         => ipcRenderer.invoke('job-card-delete', id),
});
