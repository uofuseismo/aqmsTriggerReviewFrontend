# Overview

Frontend for reviewing AQMS subnet triggers. An analyst looks at the
waveforms behind each trigger and labels it as a local event, a teleseism or
noise. Shares its backend with aqmsDutyReviewFrontend.

## Development

    npm install
    npm run dev

The dev server proxies `/api` to the backend at `http://127.0.0.2:8090`; see
`vite.config.ts` and `.env.example`.
