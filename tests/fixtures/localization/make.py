#!/usr/bin/env python3
"""Writes the small synthetic localization projects used by tests/localization.cjs.

Every format the app reads, each with typical problems: missing and empty strings, strings left in English,
broken placeholders and too long button labels. Run: python3 tests/fixtures/localization/make.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))


def W(rel, text, enc='utf-8'):
    path = os.path.join(HERE, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding=enc, newline='\n') as f:
        f.write(text)


# Unity Localization: shared table data (+ .meta with its GUID) and three locale tables.
W('unity/Assets/Localization/UI Shared Data.asset', '''%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Script: {fileID: 11500000, guid: 15b8dd3e2c7f4c0a8f1f1a2b3c4d5e6f, type: 3}
  m_Name: UI Shared Data
  m_EditorClassIdentifier:
  m_TableCollectionName: UI
  m_TableCollectionNameGuidString: 9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d
  m_Entries:
''' + ''.join('  - m_Id: %d\n    m_Key: %s\n    m_Metadata:\n      m_Items: []\n' % row for row in [
    (1001, 'menu.play_button'), (1002, 'menu.settings_button'), (1003, 'hud.coins'), (1004, 'hud.level_up'),
    (1005, 'shop.offer'), (1006, 'tutorial.intro')]))
W('unity/Assets/Localization/UI Shared Data.asset.meta',
  'fileFormatVersion: 2\nguid: 4f2c9b1e7d3a4e5f8a6b0c1d2e3f4a5b\nNativeFormatImporter:\n  mainObjectFileID: 11400000\n')


def table(code, rows):
    head = '''%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Name: UI_''' + code + '''
  m_EditorClassIdentifier:
  m_LocaleId:
    m_Code: ''' + code + '''
  m_SharedData: {fileID: 11400000, guid: 4f2c9b1e7d3a4e5f8a6b0c1d2e3f4a5b, type: 2}
  m_Metadata:
    m_Items: []
  m_TableData:
'''
    return head + ''.join('  - m_Id: %d\n    m_Localized: %s\n    m_Metadata:\n      m_Items: []\n' % row for row in rows)


W('unity/Assets/Localization/UI_en.asset', table('en', [
    (1001, 'Play'), (1002, 'Settings'), (1003, 'Coins: {0}'), (1004, "'Level {level} reached!'"),
    (1005, '"Buy <b>{0}</b> gems for {1}"'), (1006, "'Tap anywhere to start.\n\n      Swipe to move your hero.'")]))
W('unity/Assets/Localization/UI_de.asset', table('de', [
    (1001, 'Spielen'), (1002, 'Einstellungen und Optionen'), (1003, 'Münzen: {0}'), (1004, "'Level erreicht!'"), (1005, '')]))
W('unity/Assets/Localization/UI_es.asset', table('es', [(1001, 'Jugar'), (1002, 'Settings'), (1003, 'Monedas: {0}')]))

# I2 Localization CSV export (Key, Type, Desc, then languages).
W('i2/I2Languages.csv', '''Key,Type,Desc,English,German [de],Spanish
Menu/Play,Text,Main menu button,Play,Spielen,Jugar
Menu/Quit,Text,,Quit,Beenden,
Shop/Price,Text,,"Price: %d coins","Preis: %d Münzen","Precio: %s monedas"
Dialog/Welcome,Text,,"Welcome, {0}!
Ready?","Willkommen, {0}!
Bereit?",
Hud/Score,Text,,Score,Score,Puntos
''')

# JSON, one nested file per language.
W('json/locales/en.json', json.dumps({'menu': {'play': 'Play', 'continue': 'Continue'}, 'hud': {'hp': 'HP {{value}}', 'gold': 'Gold: {{amount}}'},
                                      'errors': {'network': 'No connection. Try again later.'}}, indent=2, ensure_ascii=False) + '\n')
W('json/locales/ru.json', json.dumps({'menu': {'play': 'Играть', 'continue': 'Продолжить'}, 'hud': {'hp': 'ОЗ {{value}}', 'gold': 'Золото: {{count}}'}},
                                     indent=2, ensure_ascii=False) + '\n')

# Android: default values (English), German and Spanish; values-night is not a language.
W('android/app/src/main/res/values/strings.xml', '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name" translatable="false">Tower Rush</string>
    <string name="btn_start">Start</string>
    <string name="greeting">Hello, %1$s! You have %2$d lives.</string>
    <string name="rate_us">Enjoying the game? Rate us!</string>
    <string name="quote">Don\\'t give up</string>
</resources>
''')
W('android/app/src/main/res/values-de/strings.xml', '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="btn_start">Spiel jetzt starten</string>
    <string name="greeting">Hallo, %1$s! Du hast Leben.</string>
    <string name="rate_us"></string>
</resources>
''')
W('android/app/src/main/res/values-es/strings.xml', '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="btn_start">Empezar</string>
    <string name="greeting">¡Hola, %1$s! Tienes %2$d vidas.</string>
    <string name="rate_us">¿Te gusta el juego? ¡Valóranos!</string>
    <string name="quote">No te rindas</string>
</resources>
''')
W('android/app/src/main/res/values-night/strings.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="theme">Dark</string>\n</resources>\n')

# iOS: .strings (German in UTF-16 with BOM, as Xcode exports it) and a String Catalog.
W('ios/Game/en.lproj/Localizable.strings', '/* Main menu */\n"play" = "Play";\n"daily_reward" = "Daily reward: %@ coins";\n// HUD\n"lives" = "Lives: %d";\n"quote" = "Say \\"hi\\"";\n')
W('ios/Game/de.lproj/Localizable.strings', '﻿/* Main menu */\n"play" = "Spielen";\n"daily_reward" = "Tägliche Belohnung";\n"lives" = "";\n', enc='utf-16-le')
W('ios/Game/Localizable.xcstrings', json.dumps({'sourceLanguage': 'en', 'version': '1.0', 'strings': {
    'Play': {'localizations': {'de': {'stringUnit': {'state': 'translated', 'value': 'Spielen'}}, 'fr': {'stringUnit': {'state': 'translated', 'value': 'Jouer'}}}},
    'Level %lld': {'localizations': {'de': {'stringUnit': {'state': 'translated', 'value': 'Level %lld'}}}},
    'Watch an ad to get %@ gems': {'localizations': {'fr': {'stringUnit': {'state': 'translated', 'value': 'Regardez une pub pour obtenir des gemmes'}}}},
    'Tower Rush': {'shouldTranslate': False}}}, indent=2, ensure_ascii=False) + '\n')

# gettext: template and a German catalog with a fuzzy and an empty entry.
W('po/locale/messages.pot', '''msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"

#: ui/menu.py:10
msgid "New game"
msgstr ""

msgid "Load game"
msgstr ""

msgctxt "button"
msgid "Back"
msgstr ""

msgid "You found %(count)s keys"
msgstr ""
''')
W('po/locale/de/LC_MESSAGES/messages.po', '''msgid ""
msgstr ""
"Language: de\\n"
"Content-Type: text/plain; charset=UTF-8\\n"

#: ui/menu.py:10
msgid "New game"
msgstr "Neues Spiel"

#, fuzzy
msgid "Load game"
msgstr "Spiel laden"

msgctxt "button"
msgid "Back"
msgstr ""
''')
print('fixtures written to', HERE)
