// Where Petya's version is written, as [file, text with the current version, text with the next one].
// Used by scripts/bump-version.cjs to change them and by tests/version.cjs to check them.
module.exports=(current,next=current)=>[
 ['package.json',`"version": "${current}"`,`"version": "${next}"`],
 ['src/ui/index.html',`<footer>ПЕТЯ / ${current} `,`<footer>ПЕТЯ / ${next} `],
 ['src/locales/en.json',`"ПЕТЯ / ${current}": "PETYA / ${current}"`,`"ПЕТЯ / ${next}": "PETYA / ${next}"`],
 ['src/codex-client.cjs',`title:'Петя',version:'${current}'`,`title:'Петя',version:'${next}'`],
 ['README.md',`version-${current}-`,`version-${next}-`],
];
