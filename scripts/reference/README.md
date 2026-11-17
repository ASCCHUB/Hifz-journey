# Pinned Quran comparison reference

`UthmanicHafs_v2-0 data/hafsData_v2-0.json` is the `hafsData_v2-0.json` file extracted from the King Fahd Complex developer package `UthmanicHafs_v2-0.zip`.

- Official publisher download: <https://download.qurancomplex.gov.sa/resources_dev/UthmanicHafs_v2-0.zip>
- Publisher package mirror used for the checked-in extraction: <https://cdn.quran.ws/KFGQPC/resources/quran-dev/uthmanic-hafs/UthmanicHafs_v2-0.zip>
- Pinned package SHA-256: `a7b0e5591945712ec5e4d6142938ae4d1e9b49bdc89dff06222789bfebdfd72c`
- Extracted JSON SHA-256: `d2960b3217962e7e4252abdcece67bea3d6b48271e4cd3af45bbbb2dd5c872ca`
- App Quran file SHA-256 baseline: `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680`

The app file is identified in its project documentation as a QuranEnc `quran-json` snapshot. Its upstream package version was not retained, so this manifest records the exact local file hash instead of guessing a version. The validator preserves all Arabic letters and marks; it removes only whitespace, tatweel, and the reference export's trailing ayah display glyph. Any remaining differences are reported, never auto-corrected. A qualified Hafiz should review any reported text differences before anyone changes Quran text.
