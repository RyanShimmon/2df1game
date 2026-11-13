// Shared navigation glyphs. Always paired with visible text or an accessible label.
const paths={
 balanced:'M5 9h14M5 15h14',
 push:'m13 2-9 12h7l-1 8 10-13h-7l1-7Z',
 grid:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
 weather:'M7 17h11a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0 0 6Zm2 3-1 2m8-2-1 2',
 reset:'M4 10a8 8 0 1 1 1 8M4 4v6h6',
 tools:'m4 20 8-8m2-9a6 6 0 0 0-6 8l-6 6a2 2 0 0 0 3 3l6-6a6 6 0 0 0 8-6l-4 3-3-3Z',
 team:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 7',
 aero:'M3 7h18M5 4v6m14-6v6M3 17h18m-9-6v10m-3-3 3 3 3-3',
 flag:'M5 21V3m0 1h14l-3 4 3 4H5',
 garage:'M3 21V9l9-6 9 6v12M7 21V11h10v10M7 15h10M7 18h10',
 book:'M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-2-1-6-2-10 1Z',
 keys:'M3 6h18v12H3ZM6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1M7 15h10',
 settings:'M4 7h16M4 17h16M8 4v6m8 4v6',
 map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
 arrow:'M4 12h16m-6-6 6 6-6 6',
};
export function uiIcon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.arrow}"/></svg>`;}
