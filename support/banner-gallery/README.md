# Banner gallery

Open `banner-gallery.html` in a browser. It works offline and includes a snapshot of
`templates/eoe 1100/ModuleData/snowballs_in_use.xml` and the standard Bannerlord masks
and palette already bundled in `../banner-recolor.html`.

The interface defaults to **English**. The **Беларуская / English** button switches
languages and saves the choice in browser local storage. Switching preserves the
imported data, current category, filters, page, and open preview. If local storage
is unavailable, the gallery still works and defaults to English on the next load.
Banner names, category IDs, and banner codes stay as provided in the XML.

Click **Load XML / Загрузіць XML** to select any current `snowballs_in_use.xml`, including the
EoE 1100, Eastern Europe 1259, Anno Domini 1259, or main module file. Files are processed
locally in the browser. Importing a file replaces the current gallery; it does not
edit the XML. Invalid XML leaves the previous gallery available.

- Categories come from `web-category-id`; missing categories appear under “Uncategorized / Без катэгорыі”.
- A banner is HD when `web-hd="true"`, standard when `web-hd="false"`, and unmarked
  when the attribute is missing or invalid. `web-hq` is not used.
- A category is HD only when **every** banner in it is HD. Mixed and unmarked
  categories have separate labels. This considers the whole imported category,
  including commented records, independently of search, filters, and pagination.
- Commented banners are included by default and can be hidden with the checkbox.
- Search by name, ID, or category; filter by quality; sort by category, name, or HD.
- Click a preview to enlarge it. Copy buttons copy the original banner string;
  the enlarged view can also copy `banner_key="…"`. If clipboard access is blocked,
  the code is selected for manual copying with Ctrl+C.
- Previews load as they become visible, with 48 cards per page. Unknown mod emblems
  or colors are explicitly marked on the affected previews.

After editing the XML, load it through the file picker to see the latest version.
To refresh the embedded snapshot and native assets for distribution, run from the
repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File support/banner-gallery/build-banner-gallery.ps1
```

You can choose another snapshot with `-SourcePath 'path/to/snowballs_in_use.xml'`.
The output remains a standalone HTML file: no server, dependencies, or network
requests are needed. Preview artwork and palette credits are included in the page.

Browser integration checks (Node.js 22+ and an installed Microsoft Edge or Chromium):

```powershell
node support/banner-gallery/test-banner-gallery.cjs
```

Pass the browser executable path as the first argument if Edge is installed elsewhere.
The checks open the standalone file in a hidden headless browser and cover native
previews, XML file imports, comments, category HD rules, filtering, clipboard data,
malformed input, both interface languages, saved language preferences, and mobile layout. Temporary profiles and a desktop screenshot are
written to the system temporary directory.
