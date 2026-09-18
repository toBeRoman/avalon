# Art masters

The JPEGs the WebP files in `public/art` were derived from. They live here rather than under
`public/` so they are versioned but not uploaded with every deploy — only `public/art` is
served.

To regenerate the served copies after changing one:

```sh
cd art-src && for f in $(find . -name "*.jpg"); do
  cwebp -quiet -q 80 -m 6 "$f" -o "../public/art/${f%.jpg}.webp"
done
```

`src/client/art.ts` maps roles to the served `.webp` paths.
