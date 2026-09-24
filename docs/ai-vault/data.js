/* AI Execution Vault — content.
 * Tools: T(category, name, url, what it does, best for)
 * Prompts: P(category, title, where to run it, what you get, prompt text)
 * [BRACKETS] inside a prompt are the parts the buyer fills in.
 */
(function () {
  'use strict';

  var items = [];
  function T(c, n, u, d, best) { items.push({ c: c, k: 'tool', n: n, u: u, d: d, best: best }); }
  function P(c, n, tool, d, p) { items.push({ c: c, k: 'prompt', n: n, tool: tool, d: d, p: p }); }

  var LLM = 'Claude / ChatGPT';

  /* ───────────────────────── MARKETING ───────────────────────── */
  T('marketing', 'Perplexity', 'https://www.perplexity.ai', 'Answer engine that cites its sources. Research a market, a competitor or a trend in minutes instead of opening 30 tabs.', 'Competitor & market research');
  T('marketing', 'Clay', 'https://www.clay.com', 'Spreadsheet that enriches leads from dozens of data providers and writes a personalised line for each row with AI.', 'Outbound lead lists');
  T('marketing', 'Semrush', 'https://www.semrush.com', 'SEO suite: keyword gaps, backlink audits and what your competitors rank for, with AI writing helpers on top.', 'SEO strategy');
  T('marketing', 'Surfer', 'https://surferseo.com', 'Scores an article against the pages already ranking and tells you which terms and sections are missing.', 'Optimising blog posts');
  T('marketing', 'Apollo.io', 'https://www.apollo.io', 'B2B contact database with built-in email sequences and AI-written outreach.', 'Finding decision makers');
  T('marketing', 'Taplio', 'https://taplio.com', 'LinkedIn growth tool: post ideas from your niche, scheduling and analytics on what actually gets reach.', 'LinkedIn personal brand');
  T('marketing', 'Buffer', 'https://buffer.com', 'Schedule posts across every platform; its AI assistant rewrites one post into platform-native variants.', 'Multi-platform scheduling');
  T('marketing', 'Metricool', 'https://metricool.com', 'Analytics + planner for social and ads in one dashboard, with competitor tracking.', 'Reporting to clients');
  T('marketing', 'Google NotebookLM', 'https://notebooklm.google.com', 'Upload reports, transcripts and PDFs; ask questions grounded only in your sources, or turn them into an audio overview.', 'Digesting research fast');
  T('marketing', 'Beehiiv', 'https://www.beehiiv.com', 'Newsletter platform with a referral program, ad network and AI writing built in.', 'Owning your audience');
  T('marketing', 'SparkToro', 'https://sparktoro.com', 'Shows what your audience reads, watches, listens to and who they follow.', 'Finding where buyers hang out');
  T('marketing', 'Gamma', 'https://gamma.app', 'Turns an outline into a polished deck, one-pager or microsite in a minute.', 'Pitch decks & lead magnets');

  P('marketing', 'Ideal customer profile in 10 minutes', LLM, 'A sharp ICP with pains, triggers and the words buyers use.',
    'Act as a B2B positioning strategist. My product: [PRODUCT]. Price: [PRICE]. Current best customers: [2-3 EXAMPLES].\n\nBuild an Ideal Customer Profile with:\n1. Firmographics (industry, size, revenue, geography)\n2. The buyer and the user (titles, what they are measured on)\n3. Top 5 pains, ranked by urgency, in the customer\'s own words\n4. Buying triggers — events that make them look for a solution now\n5. Objections and the proof that answers each\n6. Where they spend attention online (specific communities, newsletters, creators)\n\nBe specific. No generic statements that would fit any company.');
  P('marketing', 'Competitor teardown', 'Perplexity', 'A side-by-side of what competitors promise, charge and get wrong.',
    'Research these competitors: [COMPETITOR 1], [COMPETITOR 2], [COMPETITOR 3].\n\nFor each, give me: headline promise, pricing, target customer, top 3 features they push, and the most common complaints in public reviews (G2, Reddit, Trustpilot, App Store). Cite sources.\n\nThen: list 3 positioning angles none of them own that a product like [MY PRODUCT] could claim.');
  P('marketing', '30-day content calendar', LLM, 'A month of posts mapped to funnel stages, not random ideas.',
    'I am a [NICHE] creator selling [OFFER] to [AUDIENCE]. I post on [PLATFORMS], [N] times per week.\n\nCreate a 30-day content calendar as a table: Day | Platform | Funnel stage (awareness / trust / conversion) | Format | Hook | Key point | CTA.\n\nRules: 60% awareness, 30% trust, 10% conversion. Every hook under 12 words. No two consecutive posts in the same format.');
  P('marketing', 'Hook generator (20 variants)', LLM, 'Scroll-stopping first lines using proven hook patterns.',
    'Topic of my post: [TOPIC]. Audience: [AUDIENCE].\n\nWrite 20 hooks, 4 for each pattern:\n- Contrarian ("Everyone says X. They\'re wrong.")\n- Specific result ("How I got [number] in [timeframe]")\n- Mistake ("The [thing] mistake that cost me [cost]")\n- Curiosity gap\n- Direct call-out ("If you [situation], read this")\n\nMax 15 words each. Mark your top 3 with ★ and explain why in one line.');
  P('marketing', 'Repurpose one video into 10 posts', LLM, 'One long piece of content becomes a week of platform-native posts.',
    'Here is the transcript of my video:\n"""\n[PASTE TRANSCRIPT]\n"""\n\nRepurpose it into:\n- 3 X/Twitter posts (one thread of 6 tweets, two single posts)\n- 2 LinkedIn posts (story-driven, line breaks, no hashtags spam)\n- 3 short-form video scripts (under 45 seconds, hook in first 2 seconds)\n- 1 newsletter section (200 words)\n- 1 carousel outline (8 slides)\n\nKeep my voice. Pull exact phrases from the transcript where they are strong.');
  P('marketing', 'Landing page audit', LLM, 'A conversion review with concrete fixes ranked by impact.',
    'Act as a conversion rate optimisation expert. Here is my landing page copy (and structure):\n"""\n[PASTE PAGE TEXT]\n"""\nTarget visitor: [WHO]. Goal: [SIGN-UP / PURCHASE / CALL].\n\nScore 1–10 on: clarity of offer, relevance to visitor, proof, objection handling, CTA strength, friction.\nThen list the 7 changes most likely to raise conversions, ordered by expected impact, with rewritten copy for each.');
  P('marketing', 'SEO keyword cluster plan', LLM, 'A topic cluster that builds authority instead of random posts.',
    'My site sells [PRODUCT] to [AUDIENCE]. Seed keyword: [KEYWORD].\n\nBuild a topic cluster: 1 pillar page + 12 supporting articles. For each: working title, primary keyword, search intent (informational / commercial / transactional), 3 secondary keywords, and which other article it should link to.\n\nPrioritise low-competition, high-intent topics a small site can win.');
  P('marketing', 'Paid ad angles matrix', LLM, '15 ad concepts across angles and formats, ready to test.',
    'Product: [PRODUCT]. Audience: [AUDIENCE]. Main benefit: [BENEFIT]. Price: [PRICE].\n\nCreate an ad-angle matrix: 5 angles (pain, desire, social proof, objection-crusher, us-vs-them) × 3 formats (UGC video script, static image headline + subhead, carousel). For each cell: the concept in one line plus the exact primary text (under 125 characters).');
  P('marketing', 'Customer review mining', LLM, 'Turns raw reviews into messaging your buyers already use.',
    'Below are customer reviews (ours and competitors\'):\n"""\n[PASTE 20-100 REVIEWS]\n"""\n\nExtract:\n1. The top 5 outcomes customers celebrate (quote them)\n2. The top 5 frustrations (quote them)\n3. Words and phrases that repeat\n4. 5 headlines built only from customer language\n5. One surprising insight I probably missed');
  P('marketing', 'Launch plan for a digital product', LLM, 'A 14-day launch sequence with daily actions.',
    'I am launching [PRODUCT] at [PRICE] on [DATE]. Audience size: [NUMBER] followers on [PLATFORM], [NUMBER] email subscribers.\n\nWrite a 14-day launch plan: 7 days pre-launch (warm-up, waitlist), launch day, 6 days open cart. For each day: goal, content piece, email (subject line + one-line summary), and one metric to check. Include a scarcity mechanism that is honest.');
  P('marketing', 'Creator partnership pitch', LLM, 'A DM/email that gets creators to promote your product on revenue share.',
    'I want [CREATOR NAME], who makes content about [THEIR TOPIC] for [AUDIENCE], to promote my product [PRODUCT] on a [SPLIT]% affiliate split.\n\nWrite: 1) a 70-word cold DM, 2) a follow-up for 4 days later, 3) a one-paragraph email version. Reference a specific piece of their content ([CONTENT]). Lead with what\'s in it for their audience, then their earnings estimate at [CONVERSION RATE]% of [VIEWS] views.');
  P('marketing', 'Newsletter growth experiments', LLM, '10 growth experiments with effort vs impact scoring.',
    'My newsletter is about [TOPIC], has [N] subscribers, grows [N] per week. Main traffic: [SOURCES].\n\nPropose 10 growth experiments. For each: hypothesis, exact execution steps, effort (1–5), expected impact (1–5), and how to measure it in 14 days. Sort by impact ÷ effort.');
  P('marketing', 'Positioning statement workshop', LLM, 'Nails the one sentence that separates you from alternatives.',
    'Run me through a positioning exercise (April Dunford style) for [PRODUCT].\nStep 1: ask me 6 questions about competitive alternatives, unique attributes and best-fit customers — wait for answers.\nStep 2: based on my answers, produce the positioning canvas and 3 candidate one-line positioning statements.');
  P('marketing', 'YouTube title & thumbnail ideas', LLM, 'Click-worthy titles paired with thumbnail concepts.',
    'Video topic: [TOPIC]. Target viewer: [WHO]. What they get: [OUTCOME].\n\nGive me 10 titles (under 60 characters) and, for the best 3, a thumbnail concept: main visual, facial expression, max 4 words of text, colour contrast. Avoid clickbait that the video can\'t pay off.');
  P('marketing', 'Email welcome sequence', LLM, '5 emails that turn a new subscriber into a buyer.',
    'New subscribers joined via [LEAD MAGNET]. I sell [OFFER] at [PRICE].\n\nWrite a 5-email welcome sequence (day 0, 1, 3, 5, 7): deliver value, tell my origin story, share a case study, handle the main objection ([OBJECTION]), make the offer. Each email: subject line, preview text, body under 200 words, one CTA.');
  P('marketing', 'Webinar outline that sells', LLM, 'A 45-minute webinar structure with a natural pitch.',
    'Webinar topic: [TOPIC]. Offer at the end: [OFFER] at [PRICE].\n\nOutline a 45-minute webinar: hook (2 min), story (5), 3 teaching points that each break a false belief (25), transition, offer stack, bonuses, guarantee, Q&A with 5 pre-written objection answers. Include timestamps.');
  P('marketing', 'Monthly performance report', LLM, 'Turns raw numbers into a report a client actually reads.',
    'Here is last month\'s data:\n"""\n[PASTE METRICS: traffic, leads, sales, spend, channels]\n"""\nWrite a one-page report for [CLIENT/ME]: 3 headline wins, 2 concerns with likely causes, a table of key metrics vs previous month, and 3 prioritised actions for next month. Plain language, no jargon.');
  P('marketing', 'Community engagement replies', LLM, 'Genuinely helpful comment replies that build authority.',
    'I am an expert in [TOPIC]. Here are 5 posts/questions from [COMMUNITY]:\n"""\n[PASTE]\n"""\nDraft a reply to each that gives a specific, useful answer first, adds one personal insight, and does not pitch anything. Under 120 words each.');
  P('marketing', 'Referral program design', LLM, 'A referral mechanic customers will actually use.',
    'Business: [BUSINESS]. Average order value: [AOV]. Margin: [MARGIN]%. Customers: [DESCRIBE].\n\nDesign 3 referral program options (two-sided reward, tiered, and non-monetary). For each: reward structure, cost per acquired customer, where the ask appears in the journey, and the exact copy for the invite message.');

  /* ───────────────────────── CODING ───────────────────────── */
  T('coding', 'Claude Code', 'https://www.anthropic.com/claude-code', 'Agentic coding in your terminal: reads the repo, edits files, runs tests and commits.', 'Multi-file changes & refactors');
  T('coding', 'Cursor', 'https://cursor.com', 'AI-first code editor (VS Code fork) with codebase-aware chat and inline edits.', 'Daily coding in an editor');
  T('coding', 'GitHub Copilot', 'https://github.com/features/copilot', 'Autocomplete, chat and coding agent inside your IDE and on GitHub pull requests.', 'Inline completions');
  T('coding', 'v0', 'https://v0.dev', 'Generates React + Tailwind UI from a prompt or a screenshot and deploys it.', 'UI prototypes');
  T('coding', 'Bolt.new', 'https://bolt.new', 'Full-stack apps in the browser from a prompt, with a live preview and one-click deploy.', 'Weekend MVPs');
  T('coding', 'Lovable', 'https://lovable.dev', 'Chat your way to a working web app with auth and database wired up.', 'Non-dev founders');
  T('coding', 'Replit Agent', 'https://replit.com', 'Cloud IDE whose agent builds, runs and hosts an app from a description.', 'Hosted prototypes');
  T('coding', 'Windsurf', 'https://windsurf.com', 'AI editor with an agent that keeps context across multi-step tasks.', 'Agentic editing');
  T('coding', 'Supabase', 'https://supabase.com', 'Postgres, auth, storage and edge functions, with an AI assistant that writes SQL and policies.', 'Backend in an afternoon');
  T('coding', 'CodeRabbit', 'https://www.coderabbit.ai', 'Automatic AI code review on every pull request.', 'Catching bugs before merge');
  T('coding', 'Warp', 'https://www.warp.dev', 'Terminal with AI command search and an agent mode.', 'Shell commands you forgot');
  T('coding', 'Vercel', 'https://vercel.com', 'Deploys front-ends and serverless functions on git push, with preview URLs per branch.', 'Shipping fast');

  P('coding', 'Spec before code', 'Claude Code / Cursor', 'Forces a plan so the AI doesn\'t build the wrong thing fast.',
    'Before writing any code, read the relevant files and produce a short implementation spec for: [FEATURE].\n\nInclude: files to change, data model changes, edge cases, how it will be tested, and anything ambiguous you need me to decide. Do not write code until I approve the spec.');
  P('coding', 'Senior code review', LLM, 'A reviewer that finds bugs, not style nits.',
    'Review this code like a senior engineer who will be paged at 3am if it breaks:\n```\n[PASTE CODE OR DIFF]\n```\nFocus in order: correctness bugs, security issues, data loss risks, performance, then readability. For each finding: line, what breaks, a concrete input that triggers it, and the fix. Skip pure style comments.');
  P('coding', 'Explain this codebase', 'Claude Code', 'An onboarding map of an unfamiliar repo.',
    'Explore this repository and write me an onboarding guide: what the app does, the main entry points, how a request flows through the system, where data is stored, how to run it locally and run tests, and the 5 files I should read first. Keep it under 600 words.');
  P('coding', 'Write the tests first', 'Claude Code / Cursor', 'TDD loop driven by the AI.',
    'For [FUNCTION/FEATURE], write failing tests first that cover: the happy path, empty input, invalid input, boundary values, and [DOMAIN-SPECIFIC CASE]. Use [TEST FRAMEWORK]. Run them and show they fail. Then implement the minimum code to make them pass, and run them again.');
  P('coding', 'Debug from a stack trace', LLM, 'Root cause instead of guess-and-patch.',
    'Here is the error and stack trace:\n```\n[PASTE]\n```\nRelevant code:\n```\n[PASTE]\n```\nWhat I expected: [EXPECTED]. What happens: [ACTUAL].\n\nList the 3 most likely root causes ranked by probability, how to confirm each with one quick check, and the fix for the most likely one. Don\'t suggest wrapping it in try/catch.');
  P('coding', 'Safe refactor plan', 'Claude Code', 'Refactor in small, verifiable steps.',
    'I want to refactor [MODULE] to [GOAL]. Propose a sequence of small steps where the tests pass after every step. For each step: what changes, what could break, and how we verify. Then execute step 1 only and stop.');
  P('coding', 'SQL from plain English', LLM, 'Correct queries with the reasoning shown.',
    'Schema:\n```\n[PASTE TABLES]\n```\nWrite a [POSTGRES/MYSQL] query that returns: [WHAT YOU NEED].\nExplain each join and filter in one line, note any NULL or duplicate pitfalls, and suggest an index if the query would scan a large table.');
  P('coding', 'Landing page from a description', 'v0 / Bolt.new', 'A production-looking landing page in one shot.',
    'Build a responsive landing page for [PRODUCT], which [ONE-LINE VALUE PROP] for [AUDIENCE].\nSections: hero with headline + subhead + primary CTA, logo strip, 3 benefit cards, how-it-works (3 steps), testimonials, pricing ([PRICE]), FAQ (5 items), final CTA.\nStyle: dark mode, #09090b background, 1px subtle borders, Inter font, generous spacing, subtle hover states. Accessible contrast.');
  P('coding', 'API integration scaffold', 'Claude Code / Cursor', 'A typed client for any REST API with retries.',
    'Create a typed [LANGUAGE] client for the [API NAME] API (docs: [URL]). Endpoints needed: [LIST].\nRequirements: API key from env var, timeouts, retry with exponential backoff on 429/5xx only, typed responses, clear errors. Add one example usage and one test with a mocked HTTP layer.');
  P('coding', 'Security review checklist', LLM, 'Catches the common holes before launch.',
    'Audit this [FRAMEWORK] app code for security issues:\n```\n[PASTE ROUTES / HANDLERS]\n```\nCheck specifically: authn/authz on every route, IDOR, injection (SQL, command, template), XSS, CSRF, secrets in code, unsafe file uploads, missing rate limits, and verbose error leaks. Report only real findings with a fix for each.');
  P('coding', 'Write a README that sells', LLM, 'Docs that get people from clone to running.',
    'Write a README for this project:\n"""\n[DESCRIBE PROJECT + PASTE package.json / main files]\n"""\nSections: one-line pitch, screenshot placeholder, quickstart (copy-paste commands that work), configuration table (env vars), common tasks, troubleshooting, license. Keep it scannable.');
  P('coding', 'Regex with explanation', LLM, 'A regex you can trust, plus test cases.',
    'Write a regex ([FLAVOUR: JS/Python/PCRE]) that matches: [DESCRIBE]. It must NOT match: [COUNTER-EXAMPLES].\nExplain each part, then give 6 test strings (3 match, 3 don\'t) and the expected result for each.');
  P('coding', 'Performance profiling guide', LLM, 'Finds what is actually slow.',
    'My [PAGE/ENDPOINT] takes [TIME]; target is [TARGET]. Stack: [STACK]. Code:\n```\n[PASTE]\n```\nList the likely bottlenecks in order, how to measure each (specific tool/command), and the fix. Flag N+1 queries, missing indexes, unnecessary re-renders or blocking I/O.');
  P('coding', 'Migrate framework version', 'Claude Code', 'A controlled upgrade with a rollback path.',
    'Upgrade this project from [FRAMEWORK] [OLD VERSION] to [NEW VERSION]. First list the breaking changes that affect this codebase (search the code for each). Then upgrade dependencies, fix breakages one area at a time, run the build and tests after each area, and summarise what changed.');
  P('coding', 'Commit message & PR description', 'Claude Code', 'Clean history without the effort.',
    'Look at the staged diff. Write a commit message: imperative subject under 60 characters that says why, then a body explaining what changed and any trade-offs. Then write a PR description with: summary, how to test, screenshots needed (yes/no), risks.');
  P('coding', 'Chrome extension MVP', 'Claude Code / Cursor', 'A working Manifest V3 extension skeleton.',
    'Build a Chrome extension (Manifest V3) that [WHAT IT DOES]. Include manifest.json with minimal permissions, a popup UI, a content script if needed, and storage via chrome.storage. Explain how to load it unpacked and test it.');
  P('coding', 'Stripe / Whop webhook handler', 'Claude Code / Cursor', 'Payment webhooks that are verified and idempotent.',
    'Write a webhook endpoint in [FRAMEWORK] for [STRIPE/WHOP] that handles [EVENTS]. Requirements: verify the signature with the raw body, reject stale timestamps, make processing idempotent by event id, return 2xx quickly, and log failures. Include a test that sends a signed sample payload.');
  P('coding', 'Data model design', LLM, 'A schema that won\'t need rewriting in a month.',
    'I\'m building [APP]. Core actions users take: [LIST]. Design the database schema ([POSTGRES]): tables, columns with types, keys, indexes, and constraints. Explain the choices, what queries it optimises for, and one thing that will need to change at 100× scale.');
  P('coding', 'Convert script to CLI tool', LLM, 'A throwaway script becomes a reusable tool.',
    'Turn this script into a proper CLI:\n```\n[PASTE]\n```\nAdd argument parsing with --help, input validation with clear error messages, a --dry-run flag, exit codes, and a short usage section. Keep dependencies minimal.');

  /* ───────────────────────── COPYWRITING ───────────────────────── */
  T('copywriting', 'Claude', 'https://claude.ai', 'Strong long-form writer that follows a voice guide closely; Projects keep your brand docs on hand.', 'Long-form & brand voice');
  T('copywriting', 'ChatGPT', 'https://chatgpt.com', 'Versatile assistant with custom GPTs you can train on your style and offers.', 'Fast drafts & variants');
  T('copywriting', 'Jasper', 'https://www.jasper.ai', 'Marketing-team writing platform with brand voice and campaign templates.', 'Teams & agencies');
  T('copywriting', 'Copy.ai', 'https://www.copy.ai', 'Go-to-market workflows that generate sales and marketing copy at scale.', 'Sales copy at volume');
  T('copywriting', 'Grammarly', 'https://www.grammarly.com', 'Grammar, clarity and tone suggestions everywhere you type.', 'Final polish');
  T('copywriting', 'Hemingway Editor', 'https://hemingwayapp.com', 'Highlights long sentences, passive voice and complex words to make copy readable.', 'Readability');
  T('copywriting', 'Wordtune', 'https://www.wordtune.com', 'Rewrites a sentence in several tones and lengths in one click.', 'Sentence-level rewrites');
  T('copywriting', 'QuillBot', 'https://quillbot.com', 'Paraphraser and summariser with multiple modes.', 'Rephrasing & summaries');
  T('copywriting', 'Descript', 'https://www.descript.com', 'Edit audio/video by editing the transcript; great source material for written content.', 'Turning talks into text');
  T('copywriting', 'Otter.ai', 'https://otter.ai', 'Live meeting transcription with summaries and action items.', 'Capturing ideas from calls');
  T('copywriting', 'Notion AI', 'https://www.notion.com/product/ai', 'AI inside your docs and wiki: draft, summarise and query your notes.', 'Writing where you plan');
  T('copywriting', 'Typefully', 'https://typefully.com', 'Write, schedule and analyse threads and posts for X and LinkedIn.', 'Threads & short posts');

  P('copywriting', 'Brand voice guide from samples', LLM, 'Captures your voice so every future draft sounds like you.',
    'Here are 5 pieces of my best writing:\n"""\n[PASTE SAMPLES]\n"""\nAnalyse my voice and write a brand voice guide: tone (3 adjectives with explanation), sentence length and rhythm, vocabulary I use and avoid, how I open and close, humour level, formatting habits. End with a "do / don\'t" table and a 100-word example written in my voice.');
  P('copywriting', 'Sales page (long-form)', LLM, 'A complete sales page using a proven structure.',
    'Write a long-form sales page for [PRODUCT] at [PRICE] for [AUDIENCE].\nStructure: headline, subheadline, problem agitation, failed alternatives, the mechanism (why this works), what\'s inside, who it\'s for / not for, testimonials placeholders, offer stack with values, guarantee, FAQ (6), final CTA, P.S.\nUse my brand voice: [VOICE NOTES]. No hype words like "revolutionary" or "game-changing".');
  P('copywriting', 'PAS / AIDA / BAB variants', LLM, 'The same message in three frameworks to A/B test.',
    'Offer: [OFFER]. Audience: [AUDIENCE]. Main pain: [PAIN].\nWrite three versions of a 120-word promo: 1) Problem-Agitate-Solve, 2) Attention-Interest-Desire-Action, 3) Before-After-Bridge. Label each and add a one-line note on when it will outperform the others.');
  P('copywriting', 'Headline split-test pack', LLM, '25 headlines across 5 styles.',
    'Product: [PRODUCT]. Core promise: [PROMISE]. Audience: [AUDIENCE].\nWrite 25 headlines, 5 each in these styles: how-to, number/list, question, bold claim with proof, and "without" (get X without Y). Max 12 words. Mark the top 3.');
  P('copywriting', 'Cold email that gets replies', LLM, 'Short, personal, low-friction outreach.',
    'Write a cold email to [ROLE] at [COMPANY TYPE] offering [OFFER].\nPersonalisation hook: [SPECIFIC OBSERVATION].\nRules: under 90 words, one idea, no attachments or links in email 1, ends with a low-friction question (not "book a call"). Give 3 subject lines (under 5 words, lowercase) and a 2-line follow-up.');
  P('copywriting', 'Product description that converts', LLM, 'Benefit-led descriptions instead of spec lists.',
    'Product: [NAME]. Features: [LIST]. Buyer: [WHO]. Price: [PRICE].\nWrite: a 1-line hook, a 60-word description that translates each feature into an outcome, 5 scannable bullets ("so you can…"), and a short line that handles the main objection ([OBJECTION]).');
  P('copywriting', 'Twitter/X thread from an idea', LLM, 'A tight, valuable thread with a strong first tweet.',
    'Idea: [IDEA]. Audience: [AUDIENCE]. My credibility: [PROOF].\nWrite a 7–9 tweet thread. Tweet 1: hook with a specific promise. Middle: one concrete point per tweet, with an example or number. Last: summary + soft CTA to [CTA]. Each tweet under 260 characters.');
  P('copywriting', 'LinkedIn story post', LLM, 'A personal story that teaches a business lesson.',
    'Story from my experience: [DESCRIBE WHAT HAPPENED]. Lesson: [LESSON].\nWrite a LinkedIn post: first line under 10 words that creates tension, short paragraphs (1–2 lines), a specific moment with a detail, the turning point, the lesson in one sentence, a question to spark comments. No emojis at line starts, max 2 hashtags.');
  P('copywriting', 'Objection-handling FAQ', LLM, 'An FAQ that removes reasons not to buy.',
    'Product: [PRODUCT] at [PRICE]. Audience: [AUDIENCE].\nList the 10 most likely objections a hesitant buyer has (price, time, trust, fit, "I can do it myself", etc.). For each, write an FAQ entry: the question as the buyer would phrase it, and a 2–3 sentence honest answer with proof where possible.');
  P('copywriting', 'Rewrite for clarity', LLM, 'Cuts fluff and makes copy easy to read.',
    'Rewrite this for clarity:\n"""\n[PASTE TEXT]\n"""\nTarget reading level: grade 7. Cut filler, replace jargon, use active voice, keep every factual claim. Show the rewrite, then a list of what you removed and why.');
  P('copywriting', 'Case study from a client win', LLM, 'Turns a result into proof that sells.',
    'Client: [CLIENT / INDUSTRY]. Situation before: [BEFORE]. What we did: [SOLUTION]. Results: [NUMBERS]. Quote: [QUOTE OR "none"].\nWrite a 400-word case study: headline with the result, challenge, approach (3 steps), results with numbers, client quote, and a CTA for similar companies.');
  P('copywriting', 'Video sales letter script', LLM, 'A 3–5 minute VSL script.',
    'Write a VSL script for [PRODUCT] at [PRICE] targeting [AUDIENCE].\nFlow: pattern-interrupt hook (10s), the big problem, my story/credibility, the reason other solutions fail, the new mechanism, proof, offer, bonuses, guarantee, urgency, CTA. Mark on-screen text in [brackets]. Around 600 words.');
  P('copywriting', 'Abandoned cart emails', LLM, '3 recovery emails that don\'t feel desperate.',
    'Store: [STORE]. Product type: [PRODUCTS]. Brand voice: [VOICE].\nWrite 3 abandoned-cart emails (1h, 24h, 72h): 1) helpful reminder, 2) handle top objection ([OBJECTION]) + social proof, 3) last call with [INCENTIVE or no incentive]. Subject line + preview + body under 120 words each.');
  P('copywriting', 'Bio & about page', LLM, 'Short and long bios that build credibility.',
    'About me: [BACKGROUND, RESULTS, WHO I HELP, PERSONALITY].\nWrite: a 150-character social bio, a 50-word speaker bio, and a 250-word About page that starts with the reader\'s problem, not my history. Include one specific, human detail.');
  P('copywriting', 'Microcopy pack for an app', LLM, 'Buttons, empty states and errors that feel human.',
    'App: [APP] for [USERS]. Voice: [VOICE].\nWrite microcopy for: 5 primary buttons, 3 empty states, 5 error messages (say what happened and what to do next), 3 success confirmations, and an onboarding tooltip sequence (4 steps). Keep each under 12 words.');
  P('copywriting', 'Offer naming brainstorm', LLM, 'Names that are memorable and say what it does.',
    'Offer: [DESCRIBE]. Audience: [AUDIENCE]. Vibe: [PREMIUM / PLAYFUL / TECHNICAL].\nGive 20 name ideas across: descriptive, benefit-based, metaphor, and invented words. For the top 5: a tagline and whether the .com is likely taken (say "check" — don\'t guess).');
  P('copywriting', 'Testimonial request message', LLM, 'Gets specific, usable testimonials.',
    'Write a message asking [CLIENT] for a testimonial about [PRODUCT/SERVICE]. Include 4 guiding questions that draw out: situation before, hesitation before buying, specific result, and who they\'d recommend it to. Friendly, under 100 words, easy to answer in 5 minutes.');
  P('copywriting', 'Press release', LLM, 'A newsworthy release in standard format.',
    'Announcement: [NEWS]. Company: [COMPANY]. Date/location: [DATE, CITY]. Key numbers: [NUMBERS]. Quote from: [NAME, TITLE].\nWrite a press release: headline, subheadline, dateline lead paragraph answering who/what/when/where/why, supporting paragraphs, quote, boilerplate, media contact placeholder. Under 450 words.');

  /* ───────────────────────── AUTOMATION ───────────────────────── */
  T('automation', 'n8n', 'https://n8n.io', 'Open-source workflow automation with AI agent nodes; self-host for unlimited runs.', 'Complex, cheap automations');
  T('automation', 'Make', 'https://www.make.com', 'Visual scenario builder with deep app integrations and routers.', 'Visual multi-step flows');
  T('automation', 'Zapier', 'https://zapier.com', 'The largest app catalogue for trigger → action automations, plus AI steps and agents.', 'Quick app-to-app glue');
  T('automation', 'Relay.app', 'https://www.relay.app', 'Automations with human-in-the-loop approval steps and AI built in.', 'Workflows needing approval');
  T('automation', 'Lindy', 'https://www.lindy.ai', 'Build AI agents (inbox, meetings, lead qualifying) that act on your behalf.', 'AI assistants for admin');
  T('automation', 'Gumloop', 'https://www.gumloop.com', 'Drag-and-drop AI pipelines for scraping, enrichment and document processing.', 'AI data pipelines');
  T('automation', 'Bardeen', 'https://www.bardeen.ai', 'Browser automation that scrapes pages and pushes data to your apps.', 'In-browser tasks');
  T('automation', 'Browse AI', 'https://www.browse.ai', 'Train a robot to extract and monitor data from any website, no code.', 'Monitoring websites');
  T('automation', 'Apify', 'https://apify.com', 'Marketplace of ready-made scrapers and a platform to run your own.', 'Scraping at scale');
  T('automation', 'Airtable', 'https://www.airtable.com', 'Database-spreadsheet with AI fields and native automations.', 'Operations hub / CRM');
  T('automation', 'Pipedream', 'https://pipedream.com', 'Code-first workflows: write Node/Python steps with managed auth.', 'Developers automating');
  T('automation', 'Fireflies.ai', 'https://fireflies.ai', 'Records, transcribes and summarises meetings, and pushes notes to your CRM.', 'Meeting follow-ups');

  P('automation', 'Find what to automate first', LLM, 'An automation audit of your week, ranked by ROI.',
    'Here is what I do in a typical week, with rough time per task:\n"""\n[LIST TASKS + HOURS]\n"""\nMy tools: [TOOLS].\nFor each task: can it be fully automated, partly automated, or not? Suggest the tool and a trigger → steps → output outline. Estimate hours saved per month and rank by hours saved ÷ setup effort.');
  P('automation', 'Design an n8n workflow', 'Claude / ChatGPT → n8n', 'A node-by-node blueprint you can build in one sitting.',
    'Design an n8n workflow that: [GOAL].\nTrigger: [TRIGGER]. Apps: [APPS].\nGive me: each node in order (node type, key settings, expressions for mapping fields), where to add an AI node and its exact system prompt, error handling (retry + notify on failure), and how to test it with sample data.');
  P('automation', 'AI email triage rules', 'n8n / Make + LLM', 'Classifies incoming mail and drafts replies.',
    'You are an inbox triage assistant for [ROLE/BUSINESS]. For the email below, return JSON only:\n{"category": "lead|support|invoice|partnership|newsletter|spam|personal", "priority": 1-3, "summary": "one sentence", "needs_reply": true|false, "draft_reply": "string or null"}\nRules: priority 1 = money or deadline within 48h. Draft replies in [TONE], under 90 words, never promise dates or prices.\n\nEMAIL:\n"""\n{{email_body}}\n"""');
  P('automation', 'Lead qualification scorer', 'Make / Zapier + LLM', 'Scores inbound leads so you call the right ones first.',
    'Score this inbound lead for [BUSINESS] from 0–100 against our ICP: [ICP CRITERIA].\nReturn JSON: {"score": n, "tier": "hot|warm|cold", "reasons": [3 short strings], "missing_info": [strings], "next_step": "string"}.\nLead data:\n"""\n{{form_submission}}\n"""');
  P('automation', 'Meeting notes → CRM + tasks', 'Fireflies / Otter + LLM', 'Turns a call transcript into structured updates.',
    'From this sales/client call transcript, extract JSON:\n{"summary": "3 sentences", "decisions": [], "action_items": [{"owner": "", "task": "", "due": ""}], "objections": [], "budget": "", "timeline": "", "next_meeting": "", "deal_stage": "discovery|proposal|negotiation|won|lost"}\nOnly use information stated in the transcript; use null when unknown.\n\nTRANSCRIPT:\n"""\n{{transcript}}\n"""');
  P('automation', 'Invoice / receipt data extraction', 'Gumloop / Make + LLM', 'Reads documents into clean rows for accounting.',
    'Extract data from this invoice text. Return JSON only:\n{"vendor": "", "invoice_number": "", "issue_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD", "currency": "", "subtotal": 0, "tax": 0, "total": 0, "line_items": [{"description": "", "qty": 0, "unit_price": 0}]}\nIf a field is missing, use null. Do not calculate values that are not printed.\n\nINVOICE:\n"""\n{{document_text}}\n"""');
  P('automation', 'Content repurposing pipeline spec', LLM, 'A hands-off pipeline from one video to many posts.',
    'Design an automation that runs when I upload a new video to [YOUTUBE/DRIVE]: transcribe it, generate [LIST OF OUTPUTS], save drafts to [NOTION/AIRTABLE] for approval, and schedule approved ones in [SCHEDULER]. Give the tool choice for each step, the trigger, the data passed between steps, and where a human approves.');
  P('automation', 'Customer support bot knowledge prompt', 'Any chatbot builder', 'A system prompt for a support bot that stays in its lane.',
    'You are the support assistant for [BUSINESS]. Answer only from the knowledge below. If the answer is not there, say you\'ll pass it to a human and ask for their email. Never invent policies, prices or dates. Keep answers under 80 words, friendly and specific. Offer the relevant link when one exists.\n\nKNOWLEDGE:\n"""\n[PASTE FAQ, POLICIES, PRICING, LINKS]\n"""');
  P('automation', 'Web scraper → Google Sheet brief', LLM, 'Plans a monitoring scraper with change alerts.',
    'I want to monitor [WEBSITE TYPE / URLS] for [DATA: prices, new listings, job posts…]. Plan the setup with [BROWSE AI / APIFY]: fields to extract, schedule, how to dedupe, how to detect changes, and the alert I get in [SLACK/EMAIL] with an example message. Note any terms-of-service concerns I should check.');
  P('automation', 'Onboarding automation for new clients', LLM, 'Every new client gets the same great first week, automatically.',
    'When a client pays for [SERVICE] via [PAYMENT TOOL], I want: welcome email, intake form, shared folder created, project created in [PM TOOL], kickoff call booking link, and a day-3 check-in. Map this into a [MAKE/ZAPIER/N8N] workflow: trigger, each step, the data it needs, and the email copy for welcome and day-3.');
  P('automation', 'Social listening alert', 'n8n / Make + LLM', 'Flags posts where someone is looking for what you sell.',
    'Classify this social post. Is the author actively looking for a solution related to [MY OFFER]? Return JSON: {"buying_intent": "high|medium|none", "pain": "string", "suggested_reply": "helpful reply under 60 words, no hard pitch, or null"}.\n\nPOST:\n"""\n{{post_text}}\n"""');
  P('automation', 'Weekly KPI digest', 'n8n / Make + LLM', 'Auto-generated Monday summary of your numbers.',
    'You receive last week\'s metrics as JSON and the week before for comparison. Write a Slack message: 1-line headline of the week, a bullet per metric with value and % change (↑/↓), flag anything moving more than [THRESHOLD]%, and one suggested focus for this week. Under 120 words.\n\nTHIS WEEK: {{this_week}}\nLAST WEEK: {{last_week}}');
  P('automation', 'Agent system prompt template', 'Lindy / n8n AI Agent', 'A robust prompt for an AI agent that uses tools.',
    'ROLE: You are [AGENT NAME], an assistant that [JOB].\nGOAL: [MEASURABLE OUTCOME].\nTOOLS: [LIST TOOLS + WHEN TO USE EACH].\nRULES:\n- Always confirm before [IRREVERSIBLE ACTIONS: sending email, deleting, paying].\n- If information is missing, ask one clear question.\n- Never make up data; say "unknown".\nOUTPUT FORMAT: [FORMAT].\nEXAMPLES: [1-2 examples of input → correct action].');
  P('automation', 'Zapier → n8n migration plan', LLM, 'Cut automation costs by moving heavy zaps.',
    'Here are my Zaps with monthly task counts:\n"""\n[LIST]\n"""\nWhich should move to self-hosted n8n to cut costs, which should stay? For each migrated one, list the equivalent n8n nodes and any gotchas (auth, webhooks, rate limits). Estimate monthly savings.');
  P('automation', 'Error-proof automation checklist', LLM, 'Stops silent failures in production workflows.',
    'Review this automation design:\n"""\n[DESCRIBE STEPS]\n"""\nFind failure points: API errors, rate limits, empty or malformed data, duplicates on retry, timezone issues, auth expiry. For each: what happens today, and the fix (retry, dedupe key, fallback, alert). End with a monitoring setup.');
  P('automation', 'Personalised outreach at scale', 'Clay + LLM', 'One unique first line per lead from real data.',
    'Write one personalised opening line for a cold email to {{first_name}}, {{title}} at {{company}}.\nData: recent post: {{recent_post}}; company news: {{company_news}}; website headline: {{website_headline}}.\nRules: reference one specific fact, under 25 words, no flattery words ("love", "amazing"), no questions. If data is empty, return "SKIP".');
  P('automation', 'Document summary for approvals', 'Make / Relay + LLM', 'Summaries that let you approve in 30 seconds.',
    'Summarise this [CONTRACT/PROPOSAL/REQUEST] for a busy decision maker. Return: a 2-sentence summary, key numbers (amounts, dates, terms), 3 risks or unusual clauses, and a recommended decision (approve / ask / reject) with one line of reasoning.\n\nDOCUMENT:\n"""\n{{document_text}}\n"""');
  P('automation', 'Automated competitor digest', 'Browse AI / Perplexity + LLM', 'A weekly brief of what competitors changed.',
    'Here are this week\'s detected changes from competitor websites, pricing pages and social posts:\n"""\n{{changes}}\n"""\nWrite a competitor digest: top 3 moves that matter, what each likely means strategically, and one response I should consider. Ignore cosmetic changes.');
  P('automation', 'SOP writer from a screen recording', LLM, 'Documents a process so it can be delegated or automated.',
    'Here is the transcript/notes of me doing [PROCESS]:\n"""\n[PASTE]\n"""\nWrite an SOP: purpose, when it runs, tools and access needed, numbered steps with the exact clicks/inputs, quality checks, common mistakes, and which steps could be automated (and how).');

  /* ───────────────────────── MEDIA (Video / Graphics) ───────────────────────── */
  T('media', 'Midjourney', 'https://www.midjourney.com', 'Best-in-class aesthetic image generation with style references and consistent characters.', 'Hero images & art direction');
  T('media', 'Runway', 'https://runwayml.com', 'Text/image-to-video, motion brush and AI editing tools for filmmakers.', 'Cinematic B-roll');
  T('media', 'Kling', 'https://klingai.com', 'Text and image-to-video model with realistic motion and longer clips.', 'Realistic motion video');
  T('media', 'Higgsfield', 'https://higgsfield.ai', 'Video and image generation with camera-motion presets and effects built for social content.', 'Viral-style shorts');
  T('media', 'ElevenLabs', 'https://elevenlabs.io', 'Lifelike text-to-speech, voice cloning and dubbing in many languages.', 'Voiceovers');
  T('media', 'HeyGen', 'https://www.heygen.com', 'AI avatar videos and video translation with lip-sync.', 'Talking-head videos without filming');
  T('media', 'Ideogram', 'https://ideogram.ai', 'Image generation that renders readable text reliably — posters, logos, thumbnails.', 'Graphics with text');
  T('media', 'Recraft', 'https://www.recraft.ai', 'Generates vector graphics, icons and brand-consistent illustration sets.', 'Icons & vector assets');
  T('media', 'CapCut', 'https://www.capcut.com', 'Video editor with auto-captions, templates and AI effects.', 'Editing shorts fast');
  T('media', 'Opus Clip', 'https://www.opus.pro', 'Finds the best moments in a long video and cuts them into captioned shorts.', 'Long → short clips');
  T('media', 'Suno', 'https://suno.com', 'Generates full songs with vocals from a prompt.', 'Custom music & jingles');
  T('media', 'Krea', 'https://www.krea.ai', 'Real-time image generation, upscaling and video in one canvas.', 'Fast iteration & upscaling');

  P('media', 'Cinematic image prompt formula', 'Midjourney', 'A structured prompt that gives consistent, pro-looking shots.',
    '[SUBJECT doing ACTION], [ENVIRONMENT], [TIME OF DAY + LIGHTING: e.g. golden hour rim light], shot on [CAMERA/LENS: 35mm, shallow depth of field], [MOOD], [COLOUR PALETTE], [STYLE REFERENCE: editorial photography / film still] --ar 16:9 --style raw');
  P('media', 'YouTube thumbnail concept', 'Ideogram / Midjourney', 'High-CTR thumbnail with bold, readable text.',
    'YouTube thumbnail, [EMOTION] face of a [PERSON DESCRIPTION] on the right third, looking at [OBJECT] on the left, big bold text "[MAX 4 WORDS]" in [COLOUR] with thick outline, high contrast, saturated background of [COLOUR], clean composition, 16:9');
  P('media', 'Faceless short script', LLM, 'A 30–45s script with visuals and captions planned.',
    'Write a 35-second faceless short about [TOPIC] for [AUDIENCE].\nFormat as a table: Time | Voiceover | On-screen visual (B-roll or AI prompt) | Caption text.\nHook in the first 2 seconds, a pattern interrupt at ~15s, end with a loop back to the hook. Under 90 words of voiceover.');
  P('media', 'Image-to-video motion prompt', 'Runway / Kling / Higgsfield', 'Turns a still into a shot with intentional camera movement.',
    'Animate this image: [DESCRIBE IMAGE]. Camera: [slow push-in / orbit left / crane up / handheld]. Subject motion: [WHAT MOVES, how fast]. Environment motion: [hair in wind, dust particles, light flicker]. Keep the subject\'s face and clothing unchanged. Duration [5] seconds, cinematic, no morphing.');
  P('media', 'Brand style guide for AI images', LLM, 'Keeps every generated image on-brand.',
    'My brand: [BRAND], audience [AUDIENCE], personality [3 ADJECTIVES], colours [HEX CODES].\nCreate an AI image style guide: a reusable style suffix for prompts, lighting rules, composition rules, subjects to use and avoid, 5 example prompts for [USE CASES], and negative prompts.');
  P('media', 'Product photo scene', 'Midjourney / Krea', 'Studio-quality product shots without a studio.',
    'Product photography of [PRODUCT] on [SURFACE: travertine plinth / wet black stone], [BACKGROUND], soft diffused key light from the left, subtle reflection, [PROPS that suggest the benefit], minimalist, commercial advertising photo, high detail --ar 4:5');
  P('media', 'Voiceover script with direction', 'ElevenLabs', 'A script marked up for pacing and emphasis.',
    'Rewrite this script for voiceover:\n"""\n[PASTE]\n"""\nShort sentences, easy to say out loud. Mark pauses with "…", emphasis with CAPS on single words, and add a direction line before each section (e.g. [warm, slower], [energetic]). Target [SECONDS] seconds at ~150 words per minute.');
  P('media', 'Talking-avatar video script', 'HeyGen / Synthesia', 'A natural script for an AI presenter.',
    'Write a [60]-second script for an AI presenter explaining [TOPIC] to [AUDIENCE]. Conversational, first person, contractions, one idea per sentence, no tongue-twisters or long numbers. Add [B-ROLL: …] cues where a cutaway helps. End with [CTA].');
  P('media', 'Storyboard for an ad', LLM, 'A shot-by-shot plan you can generate with AI video.',
    'Create a storyboard for a [15/30]-second ad for [PRODUCT].\nFor each shot: number, duration, shot type (wide/medium/close), camera move, what happens, text overlay, sound/VO, and a ready-to-use AI video prompt. Keep the same character description across shots: [CHARACTER].');
  P('media', 'Consistent character sheet', 'Midjourney', 'The same character across many scenes.',
    'Character reference sheet of [CHARACTER: age, build, hair, face details, outfit], front view, side view, back view, three expressions (neutral, smiling, surprised), plain light grey background, even studio lighting, consistent proportions --ar 3:2\n\nThen reuse with: [SCENE PROMPT] --cref [IMAGE URL] --cw 80');
  P('media', 'Logo concept exploration', 'Ideogram / Recraft', 'Logo directions to test before hiring a designer.',
    'Minimal logo for "[BRAND NAME]", a [INDUSTRY] brand. Concept: [IDEA / SYMBOL]. Style: flat vector, [geometric / hand-drawn / monoline], [1-2 COLOURS] on white, scalable, no gradients, no mockup, centered.');
  P('media', 'Carousel design brief', LLM, 'An Instagram/LinkedIn carousel with copy and layout.',
    'Topic: [TOPIC]. Audience: [AUDIENCE].\nCreate a 9-slide carousel: slide 1 hook (max 8 words), slides 2–8 one point each (title + max 25 words + visual idea), slide 9 CTA. Add design notes: font pairing, colour palette from [BRAND COLOURS], and layout for text-heavy vs image slides.');
  P('media', 'Clip selection from a podcast', 'Opus Clip / LLM', 'Finds the moments most likely to go viral.',
    'From this transcript with timestamps, pick the 5 best 30–60 second clips for short-form:\n"""\n[PASTE TRANSCRIPT]\n"""\nCriteria: strong standalone hook, surprising or contrarian claim, emotional moment, or tactical tip. For each: start/end timestamps, suggested caption headline, and why it works.');
  P('media', 'Music prompt for background tracks', 'Suno', 'Royalty-free tracks that fit the video mood.',
    'Instrumental [GENRE: lo-fi / cinematic / synthwave] track, [BPM] BPM, mood [MOOD], instruments [LIST], builds at 0:20, no vocals, clean ending at [LENGTH] seconds, suitable as background for [VIDEO TYPE].');
  P('media', 'Upscale & enhance settings guide', 'Krea / Magnific', 'Upscale images without the plastic AI look.',
    'I\'m upscaling a [PORTRAIT / PRODUCT / LANDSCAPE] image for [USE: print / web hero]. Recommend: upscale factor, creativity/detail strength, how to prompt the enhancer to keep skin texture/materials natural, and what to check afterwards (hands, text, edges).');
  P('media', 'Video translation plan', 'HeyGen / ElevenLabs', 'Launch your content in new languages.',
    'I want to translate my [N] best videos into [LANGUAGES]. Plan: which videos to pick (criteria), script localisation notes (idioms, units, cultural references), voice cloning vs stock voices, lip-sync or voiceover only, captions, and separate channels vs multi-language audio. Include a checklist per video.');
  P('media', 'AI B-roll shot list', 'Runway / Kling', 'Fills a talking-head video with relevant cutaways.',
    'Here is my video script:\n"""\n[PASTE]\n"""\nFor each sentence that would benefit from B-roll, write a 4–5 second AI video prompt (subject, action, camera move, lighting, style) that matches a consistent look: [STYLE]. Number them to match the script.');
  P('media', 'Ad creative variations', 'Ideogram / Midjourney', 'Multiple static ad visuals for creative testing.',
    'Create 5 static ad visual concepts for [PRODUCT] targeting [AUDIENCE]: 1) problem visual, 2) result/after visual, 3) product hero, 4) social proof (review card), 5) comparison. For each: image prompt, headline overlay (max 6 words), and placement of the CTA button. Format 1:1 and 9:16.');
  P('media', 'Short-form editing checklist', 'CapCut', 'The edits that keep viewers watching.',
    'Give me a step-by-step editing checklist for a [PLATFORM] short from raw footage: cut silences, hook in first 1.5s, jump cuts every 2–3 seconds, captions style, zooms on key words, sound effects, background music level, loop ending, safe zones for UI, export settings. Include a 10-point "before you post" check.');

  /* ───────────────────────── WORKFLOWS ───────────────────────── */
  var workflows = [
    {
      id: 'faceless',
      n: 'Faceless Short-Form Content Engine',
      d: 'Publish 5 shorts a week without filming yourself.',
      result: '20 shorts / month',
      time: '~3 h / week',
      saves: 'Saves ~14 h / week',
      stack: ['Perplexity', 'Claude', 'ElevenLabs', 'Kling / Higgsfield', 'CapCut', 'Buffer'],
      steps: [
        { t: 'Find 5 proven topics', tool: 'Perplexity', d: 'Search your niche for questions trending this week on Reddit, YouTube and X. Keep topics that already have high-view videos — demand is proven.' },
        { t: 'Script in batches', tool: 'Claude', d: 'Run the "Faceless short script" prompt for all 5 topics in one chat. Ask for a table with voiceover, visuals and captions so editing is mechanical.' },
        { t: 'Generate the voiceover', tool: 'ElevenLabs', d: 'Paste each script with direction marks. Use one consistent voice for the channel. Export as MP3.' },
        { t: 'Create visuals', tool: 'Kling / Higgsfield', d: 'Turn the visual column into 4–5 second clips using the image-to-video motion prompt. Keep one style suffix for a recognisable look.' },
        { t: 'Assemble & caption', tool: 'CapCut', d: 'Drop voiceover, cut clips to the beat, auto-caption, and follow the short-form editing checklist. Export 9:16.' },
        { t: 'Schedule everywhere', tool: 'Buffer', d: 'Schedule to TikTok, Reels and Shorts at your best times. Review analytics weekly and feed winners back into step 1.' }
      ]
    },
    {
      id: 'outbound',
      n: 'AI Cold Outreach Machine',
      d: 'Booked calls from a list of cold leads, personalised at scale.',
      result: '300 personalised emails / week',
      time: '~2 h / week',
      saves: 'Saves ~10 h / week',
      stack: ['Apollo.io', 'Clay', 'Claude', 'Instantly / your ESP', 'Airtable'],
      steps: [
        { t: 'Define the ICP', tool: 'Claude', d: 'Run the "Ideal customer profile" prompt. Turn the output into filters: industry, headcount, titles, geography.' },
        { t: 'Pull the list', tool: 'Apollo.io', d: 'Apply the filters and export 300–500 contacts with verified emails. Remove anyone you already contacted.' },
        { t: 'Enrich each lead', tool: 'Clay', d: 'Add columns for recent LinkedIn post, company news and website headline so every row has something real to reference.' },
        { t: 'Write first lines', tool: 'Clay + Claude', d: 'Use the "Personalised outreach at scale" prompt as an AI column. Rows returning SKIP get a generic but relevant opener.' },
        { t: 'Send the sequence', tool: 'Your email tool', d: 'Load the cold email (under 90 words) + 2 follow-ups. Warm up domains first, send from secondary domains, keep volume per inbox low.' },
        { t: 'Triage replies', tool: 'n8n + Claude', d: 'Route replies through the email triage prompt: interested → CRM + notify you, not now → nurture list, unsubscribe → suppress.' }
      ]
    },
    {
      id: 'newsletter',
      n: 'Video → Newsletter → Social Repurposing',
      d: 'One long video becomes a newsletter issue and a week of posts.',
      result: '1 issue + 10 posts per video',
      time: '~1.5 h per video',
      saves: 'Saves ~6 h per video',
      stack: ['Descript', 'Claude', 'Beehiiv', 'Typefully', 'Opus Clip'],
      steps: [
        { t: 'Transcribe', tool: 'Descript', d: 'Import the video and export a clean transcript with timestamps. Remove filler words automatically.' },
        { t: 'Pull the clips', tool: 'Opus Clip', d: 'Generate short clips and keep the 3–5 with the strongest hooks. Cross-check with the podcast clip-selection prompt.' },
        { t: 'Draft the newsletter', tool: 'Claude', d: 'Give Claude your brand voice guide + transcript. Ask for one issue: subject line, story intro, 3 takeaways, a resource, and a CTA.' },
        { t: 'Repurpose to social', tool: 'Claude', d: 'Run "Repurpose one video into 10 posts" on the same transcript. Edit for 10 minutes — don\'t skip this.' },
        { t: 'Publish & schedule', tool: 'Beehiiv + Typefully', d: 'Send the issue; schedule the thread and LinkedIn posts across the week, each linking back to the video.' }
      ]
    },
    {
      id: 'saas',
      n: 'Ship a Paid Micro-Product in a Weekend',
      d: 'From idea to a live page taking payments in 48 hours.',
      result: 'Live product + checkout',
      time: '~12 h total',
      saves: 'Saves ~30 h of dev time',
      stack: ['Claude', 'v0', 'Claude Code', 'Supabase', 'Whop', 'Vercel'],
      steps: [
        { t: 'Validate the idea', tool: 'Claude + Perplexity', d: 'Run the competitor teardown and review-mining prompts. Only build if people already pay for a worse version.' },
        { t: 'Write the spec', tool: 'Claude', d: 'One page: who it\'s for, the single core action, what\'s out of scope for v1. Use the "Spec before code" prompt.' },
        { t: 'Generate the UI', tool: 'v0', d: 'Use the landing page prompt for the marketing page and a second prompt for the core app screen.' },
        { t: 'Wire the backend', tool: 'Claude Code + Supabase', d: 'Tables, auth and row-level security. Ask Claude Code to write tests for the one core action first.' },
        { t: 'Add payments', tool: 'Whop', d: 'Create the product and plan in Whop, add the checkout link, and handle the membership webhook with the verified-webhook prompt.' },
        { t: 'Deploy & launch', tool: 'Vercel', d: 'Push to deploy, test a real purchase end to end, then run the 14-day launch plan prompt.' }
      ]
    },
    {
      id: 'inbox',
      n: 'Inbox & Lead Triage Autopilot',
      d: 'Your inbox sorted, leads scored and replies drafted before you wake up.',
      result: 'Inbox zero in 15 min / day',
      time: '~3 h one-time setup',
      saves: 'Saves ~6 h / week',
      stack: ['n8n', 'Gmail', 'Claude API', 'Airtable', 'Slack'],
      steps: [
        { t: 'Trigger on new mail', tool: 'n8n', d: 'Gmail trigger node polling every 5 minutes. Skip messages already labelled "AI-processed".' },
        { t: 'Classify & draft', tool: 'Claude API', d: 'Send the body through the email triage prompt. Parse the JSON; on invalid JSON retry once, then label "needs-human".' },
        { t: 'Score leads', tool: 'Claude API', d: 'For category "lead", run the lead qualification scorer. Hot leads get priority 1.' },
        { t: 'Log to CRM', tool: 'Airtable', d: 'Create or update the contact with score, summary and next step. Use the email address as the dedupe key.' },
        { t: 'Save drafts, don\'t send', tool: 'Gmail', d: 'Create the draft reply in Gmail for your review. Never auto-send to new contacts.' },
        { t: 'Morning digest', tool: 'Slack', d: 'At 8:00 post a summary: hot leads, invoices due, drafts waiting. Add an error branch that alerts you if any node fails.' }
      ]
    }
  ];

  var categories = [
    { id: 'all', n: 'All' },
    { id: 'marketing', n: 'Marketing' },
    { id: 'coding', n: 'Coding' },
    { id: 'copywriting', n: 'Copywriting' },
    { id: 'automation', n: 'Automation' },
    { id: 'media', n: 'Video & Graphics' }
  ];

  window.VAULT = { items: items, workflows: workflows, categories: categories };
})();
