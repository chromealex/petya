# Context without an integration

For read requests to Slack, Jira, Confluence, Asana, Notion, Gmail, Telegram and Google Play Console, Petya checks whether the module is enabled and connection data is saved. If there is no connection, it offers to set up the integration or to use the built-in browser. This checks that settings exist; it does not check whether the token has expired.

The choice «Без интеграции: браузер» (No integration: browser) (by voice — «нет» (no), «не надо» (don't), «через браузер» (via browser)) is saved separately for each service and company. The next such request opens the browser without asking again. A working connection takes priority. In the «Как получать контекст сервисов» (How to get service context) settings you can bring the connection offers back.

The user signs in to the service, completes the CAPTCHA and opens the needed page/conversation themselves. Then they press «Прочитать открытую страницу» (Read open page) in the dialog or say «готово» (done). Petya passes the available page text to the local analyzer together with the original question and saves the context for continuing the dialog. The connect button opens the settings; after connecting, the original question can be repeated with a button.

Browser sessions are stored separately by service and company. Reading is limited to the domains of the selected service and 40 000 characters. Forms, input fields, drafts and hidden elements are excluded. Full chat history, attachments, images and videos are not read this way. The page does not give Petya permission to send messages or change data: the browser is used for reading.

Some services block sign-in in the built-in browser. In that case an integration or an attached file/screenshot is needed. Real sign-ins to accounts depend on the service's policy and are not verified by automated tests.
