// Keep the privileged app page in place; send web links to the system browser.
module.exports = function configureExternalLinks(contents, open, onError) {
  const follow = address => {
    try {
      const url = new URL(address);
      // slack://channel?… opens a conversation in the Slack app; nothing else outside the web is opened.
      const slackApp = url.protocol === 'slack:' && /^slack:\/\/channel\?/.test(url.href);
      if (!['https:', 'http:'].includes(url.protocol) && !slackApp) return;
      Promise.resolve(open(url.href)).catch(onError);
    } catch (error) { if (error.code !== 'ERR_INVALID_URL') onError(error); }
  };
  contents.setWindowOpenHandler(({url}) => { follow(url); return {action:'deny'}; });
  contents.on('will-navigate', (event, url) => { event.preventDefault(); follow(url); });
};
