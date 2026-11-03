# PSD Validator

Upload a PSD, see what breaks the template best practices, apply fixes, and download the cleaned file. Styled for the NFL x Adobe content ecosystem.

## How it works

1. Upload a PSD.
2. The app reads the layer tree and checks it against the PSD Best Practices and Template Optimization Guide.
3. Each problem shows up as a callout with the layer, the reason, and the guide section.
4. Pick fixes and apply them. Rename fixes let you edit the name first. The app logs every change.
5. Download the updated PSD. Your original upload is never modified.

## Checks

| Rule | Guide section | Fix |
|---|---|---|
| File over the 500MB target or 4GB limit | 3a | Flag only |
| Hidden layers | 3e | Delete |
| Empty text layers | 3e | Delete |
| Guide and reference layers | 3e | Delete |
| Copy, Final, v2, old in names | 3b | Rename |
| Generic names like Layer 1 | 3b | Rename (you confirm the name) |
| Point text that can overflow | 3c | Convert to paragraph text |
| Static Smart Objects | 3d | Rasterize |
| Groups nested past 3 levels | 3e | Flag only |
| Group names not uppercase | 3e | Rename |

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to `.env.local` for settings.

To get a sample file with every problem in it:

```bash
node scripts/make-test-psd.mjs sample.psd
```

## Edit engines

Set `EDIT_ENGINE` in `.env.local`.

* `local` is the default. It edits the PSD inside the app and handles every fix in the table.
* `photoshop` sends delete and rename changes to the Adobe Photoshop API. This engine has **not been verified against the live API yet**. It needs `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET` and S3 settings, because the API reads and writes files through signed URLs. Rasterize and paragraph conversion are skipped on this engine for now.

Never commit credentials. `.env.local` is ignored by git.

## Notes

* Uploaded and fixed files are stored in `.jobs/` on local disk. Swap `src/lib/storage.ts` for S3 or Blob before deploying.
* The NFL mark and fonts here are stand ins. Replace them with the approved brand assets.
* The local engine keeps pixels and edits layer data, but open the result in Photoshop and check text boxes before using it in production.
