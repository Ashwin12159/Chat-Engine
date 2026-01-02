const SDK_VERSION = '1.0.0';

(function () {
  'use strict';

  if (window.ChatEngineSDK) return;

  let config = {
    websiteAPIKey: null,
    baseUrl: '',
    debug: false
  };

  let state = {
    iframe: null,
    button: null,
    open: false,
    sessionId: crypto.randomUUID()
  };

  const log = (...a) => config.debug && console.log('[SDK]', ...a);

  const sendToIframe = (type, data = {}) => {
    state.iframe?.contentWindow?.postMessage({
      source: 'chat-engine-sdk',
      type,
      data: { ...data, sessionId: state.sessionId }
    }, config.baseUrl);
  };

  window.addEventListener('message', (e) => {
    if (e.origin !== config.baseUrl) return;
    if (e.data?.source !== 'chat-engine-widget') return;
    if (e.data.type === 'widget-ready') {
      sendToIframe('init', {
        websiteAPIKey: config.websiteAPIKey,
        baseUrl: config.baseUrl,
        sessionId: state.sessionId,
        debug: config.debug
      });
    }

    if (e.data.type === 'widget-close') close();
  });

  const createButton = (color) => {
    const b = document.createElement('div');
        b.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.60571 8.7 3.90001C9.87812 3.30493 11.1801 2.99656 12.5 3H13C15.0843 3.11499 17.053 3.99476 18.5291 5.47086C20.0052 6.94695 20.885 8.91565 21 11V11.5Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    b.style.cssText = `
      position:fixed;bottom:20px;right:20px;
      width:60px;height:60px;border-radius:50%;
      background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;z-index:99999;
    `;
    b.onclick = toggle;
    return b;
  };

  const createIframe = () => {
    const i = document.createElement('iframe');
    i.src = `${config.baseUrl}/widget`;
    i.style.cssText = `
      position:fixed;bottom:90px;right:20px;
      width:380px;height:550px;
      border:none;border-radius:12px;
      display:none;z-index:99998;
    `;
    return i;
  };

  const open = () => {
    state.iframe.style.display = 'block';
    state.open = true;
  };

  const close = () => {
    state.iframe.style.display = 'none';
    state.open = false;
  };

  const toggle = () => state.open ? close() : open();
let initialized = false;

  const init = (userConfig) => {
    if (!userConfig.websiteAPIKey) return;

    config = { ...config, ...userConfig };

    state.button = createButton(userConfig.primaryColor || '#667eea');
    state.iframe = createIframe();

    document.body.appendChild(state.button);
    document.body.appendChild(state.iframe);

  initialized = true;
  log('SDK initialized');
};
  const isInitialized = () => initialized;
  window.ChatEngineSDK = { init, open, close, isInitialized,
  version: SDK_VERSION};
})();