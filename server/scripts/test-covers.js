async function testCovers() {
  const isbns = ['9780132350884', '9780747532743', '9780140449136', '9789552115127'];
  for (const isbn of isbns) {
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
    try {
      const res = await fetch(url);
      console.log(`Cover for ${isbn} -> HTTP ${res.status} (${res.ok ? 'HAS COVER' : 'NO COVER'})`);
    } catch (e) {
      console.log(`Cover err for ${isbn}:`, e.message);
    }
  }
}

testCovers();
