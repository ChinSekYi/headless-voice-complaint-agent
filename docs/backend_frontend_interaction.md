# Backend-Frontend Interaction

---

## Tech Stack

**Node.js**
- Runtime that executes JavaScript outside the browser
- Provides system APIs (file I/O, networking, process)
- Used to run your backend server
- [Learn more](https://www.reddit.com/r/learnjavascript/comments/3d4hs5/eli5_what_in_the_heck_is_nodejs/)

**TypeScript**
- Programming language that adds types to JavaScript
- Compiles to plain JavaScript that Node.js can run
- In this project, `tsx` runs TypeScript directly during development

**Express**
- Minimal web framework for Node.js
- Simplifies HTTP servers: routing, middleware, request/response handling
- Used to define endpoints like `POST /voice` and serve `public/` files

**How they work together:**
1. You write TypeScript (`server.ts`) using Express APIs
2. `tsx` transpiles TypeScript to JS on the fly and runs it on Node.js
3. Express handles HTTP requests/responses over Node's networking primitives

---

## Loading the Frontend

**User goes to:** `http://localhost:3000`

```
Browser                    Server
   |                         |
   |--GET http://localhost:3000/-->|
   |                         |
   |                  (looks in public/)
   |                         |
   |<------ index.html ------|
   |                         |
(renders page)
```

**What happens:**
1. Browser requests `http://localhost:3000/`
2. Express looks in `public/` folder (via `app.use(express.static("public"))`)
3. Finds `index.html`
4. Sends it to the browser
5. Browser loads HTML, CSS, JavaScript

---

## Submitting a Complaint

**User types complaint and clicks Submit**

```
FRONTEND (Browser)              BACKEND (server.ts)
==================              ===================

fetch('/voice', {
  method: 'POST',
  body: JSON.stringify({ text: "..." })
})
      |
      |--- POST request --->  app.post("/voice", async (req, res) => {
      |                         const { text } = req.body;
      |                         const result = await handleComplaint(text);
      |                         res.json({ textResponse, complaintType, ... });
      |                       });
      |<---- JSON response ---
      |
Display in UI
```

---

## Bug Encountered: ESM Module Resolution

**Issue:** With `moduleResolution: "nodenext"`, imports require `.js` extensions but `ts-node` fails to find `.ts` files.

**Solution:** Use `tsx` instead of `ts-node`:
```bash
npm install --save-dev tsx
npx tsx src/server.ts
```

`tsx` automatically resolves `.js` imports to `.ts` files and transpiles in memory.
