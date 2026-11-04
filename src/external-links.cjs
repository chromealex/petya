// Keep the privileged app page in place; send web links to the system browser.
module.exports = function configureExternalLinks(contents, open, onError) {
  const follow = address => {
    try {
      const url = new URL(address);
      if (!['https:', 'http:'].includes(url.protocol)) return;
      Promise.resolve(open(url.href)).catch(onError);
    } catch (error) { if (error.code !== 'ERR_INVALID_URL') onError(error); }
  };
  contents.setWindowOpenHandler(({url}) => { follow(url); return {action:'deny'}; });
  contents.on('will-navigate', (event, url) => { event.preventDefault(); follow(url); });
};
