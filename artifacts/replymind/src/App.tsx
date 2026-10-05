import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useAnalyzeConversation,
  useCreateConversation,
  useDeleteConversation,
  useDeleteUpload,
  useClearLocalData,
  useGetConversation,
  useGetPreferences,
  useGetUsage,
  useHealthCheck,
  useListConversations,
  useRewriteReply,
  useUpdateConversation,
  useUpdatePreferences,
  getGetConversationQueryKey,
  getGetPreferencesQueryKey,
  getGetUsageQueryKey,
  getListConversationsQueryKey,
} from '@/lib/local-hooks';
import type { ReplyTone, UserPreferenceAppearance } from '@workspace/api-client-react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  FileImage,
  Heart,
  ImagePlus,
  LockKeyhole,
  MessageCircle,
  Moon,
  MoreHorizontal,
  PenLine,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';
import { deleteLocalConversation, getLocalConversation } from '@/lib/local-store';

const queryClient = new QueryClient();
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const basePath = BASE.replace(/\/$/, '');
const fullPath = (path: string) => `${BASE}${path.replace(/^\//, '')}`;
const tones: { value: ReplyTone; label: string; note: string }[] = [
  { value: 'natural', label: 'Natural', note: 'Like you, on a good day' },
  { value: 'reassuring', label: 'Reassuring', note: 'Warm and steady' },
  { value: 'calm', label: 'Calm', note: 'Clear, no pressure' },
  { value: 'sweet', label: 'Sweet', note: 'A little extra warmth' },
  { value: 'confident', label: 'Confident', note: 'Direct and self-assured' },
  { value: 'short', label: 'Short', note: 'Say more with less' },
  { value: 'playful', label: 'Playful', note: 'Light, not careless' },
  { value: 'flirty', label: 'Flirty', note: 'A little spark' },
  { value: 'apologetic', label: 'Apologetic', note: 'Own your part' },
  { value: 'romantic', label: 'Romantic', note: 'Open-hearted' },
];

function Button({
  children, variant = 'primary', className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'quiet' | 'danger' }) {
  return <button {...props} className={`button button-${variant} ${className}`}>{children}</button>;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand-lockup" aria-label="ReplyMind home">
    <span className="brand-mark"><MessageCircle size={18} strokeWidth={2.3} /><span /></span>
    {!compact && <span className="brand-word">replymind</span>}
  </Link>;
}

function StatusNote({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`status-note ${error ? 'status-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

async function prepareScreenshot(source: File): Promise<File> {
  const maximumInputSize = 30 * 1024 * 1024;
  const maximumUploadSize = 10 * 1024 * 1024;
  if (source.size > maximumInputSize) {
    throw new Error('Choose an image under 30 MB so ReplyMind can optimize it safely.');
  }
  if (typeof createImageBitmap !== 'function') {
    if (source.size > maximumUploadSize) throw new Error('This browser cannot compress the image. Choose one under 10 MB.');
    return source;
  }

  const bitmap = await createImageBitmap(source);
  const largestSide = Math.max(bitmap.width, bitmap.height);
  if (largestSide <= 2048 && source.size <= 3 * 1024 * 1024) {
    bitmap.close();
    return source;
  }
  const scale = Math.min(1, 2048 / largestSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('This browser could not prepare the screenshot. Try another image.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const compress = (quality: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('This browser could not compress the screenshot.'));
    }, 'image/webp', quality);
  });
  let optimized = await compress(0.9);
  if (optimized.size > maximumUploadSize) optimized = await compress(0.76);
  if (optimized.size > maximumUploadSize) {
    throw new Error('The screenshot is still over 10 MB after compression. Choose a smaller image.');
  }
  if (!['image/webp', 'image/png', 'image/jpeg'].includes(optimized.type)) {
    throw new Error('This browser could not create a supported screenshot format.');
  }
  const extension = optimized.type === 'image/png' ? 'png' : optimized.type === 'image/jpeg' ? 'jpg' : 'webp';
  const baseName = source.name.replace(/\.[^.]+$/, '') || 'screenshot';
  return new File([optimized], `${baseName}.${extension}`, { type: optimized.type });
}

function Landing() {
  const health = useHealthCheck();
  return <div className="landing grain">
    <header className="site-header">
      <Logo />
      <nav className="site-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#privacy">Privacy</a>
      </nav>
      <div className="header-actions">
        <Link href="/app" className="button button-primary header-cta">Open ReplyMind <ArrowRight size={15} /></Link>
      </div>
    </header>

    <main>
      <section className="hero-section">
        <div className="hero-copy animate-rise">
          <div className="eyebrow"><span className="live-dot" /> A little more clarity, right when you need it</div>
          <h1>Know what they<br />mean. <em>Say what you</em><br /><em>mean.</em></h1>
          <p className="hero-description">A second pair of eyes for the conversations that matter. Find the feeling underneath the words, then reply in a way that still sounds like you.</p>
          <div className="hero-cta-row">
            <Link href="/app" className="button button-primary button-large">Find your words <ArrowRight size={17} /></Link>
            <span className="micro-note"><LockKeyhole size={13} /> Saved on this device</span>
          </div>
          <div className="hero-footnote"><span className="avatars"><i>J</i><i>M</i><i>A</i></span><span>For the moments you want to get right.</span></div>
        </div>
        <div className="hero-visual animate-rise delay-1" aria-label="Example of a conversation and thoughtful reply options">
          <div className="visual-halo halo-one" />
          <div className="visual-halo halo-two" />
          <div className="phone-shell">
            <div className="phone-top"><span>9:41</span><span className="phone-camera" /></div>
            <div className="chat-head"><span className="chat-avatar">M</span><span><strong>Maya</strong><small>Messages</small></span><MoreHorizontal size={18} /></div>
            <div className="chat-date">TODAY, 8:42 PM</div>
            <div className="bubble bubble-them">I had a really nice time tonight. We should do it again sometime.</div>
            <div className="bubble bubble-you">I did too. Let me know when you’re free?</div>
            <div className="reply-insight"><span className="tiny-spark"><Sparkles size={14} /></span><span><b>A good sign</b><small>They’re expressing interest and leaving the next step open.</small></span></div>
            <div className="suggestion-preview"><span className="tone-chip">NATURAL</span><p>“I’d like that. How does next Thursday look?”</p><div className="suggestion-actions"><span>Copy reply</span><ArrowDownRight size={13} /></div></div>
          </div>
          <div className="floating-note note-left"><span className="note-icon"><Heart size={14} /></span><span>Still sounds like you</span></div>
          <div className="floating-note note-right"><span className="note-check"><Check size={13} /></span><span>Context, not guesswork</span></div>
          <div className="visual-caption">A calmer way to read between the lines.</div>
        </div>
      </section>

      <div className="trust-strip"><span>MADE FOR THE TEXTS YOU RE-READ</span><div className="trust-divider" /><span>NO PERFECT ANSWER REQUIRED</span><div className="trust-divider" /><span>JUST A LITTLE MORE YOU</span></div>

      <section className="story-section" id="how-it-works">
        <div className="section-intro animate-rise"><span className="section-index">01 — THE MOMENT</span><h2>Some messages<br />take up <em>too much room.</em></h2></div>
        <div className="story-grid">
          <p className="story-lead">You read it once. Then again. You ask a friend what they think, and still keep the reply unsent.</p>
          <div className="story-aside"><span className="accent-line" /><p>ReplyMind helps you pause, understand the context, and choose words that feel right to you.</p></div>
        </div>
        <div className="moment-card"><div className="moment-label"><span className="dot-coral" /> THE UNSENT DRAFT</div><p>“I don’t know if that came out the way I meant it…”</p><div className="moment-footer"><span>That feeling is more common than you think.</span><span className="moment-scribble">take a breath</span></div></div>
      </section>

      <section className="steps-section">
        <div className="section-intro center-intro"><span className="section-index">02 — A SMALL RESET</span><h2>Understand first.<br /><em>Reply second.</em></h2><p>Three quiet steps between a message and your next move.</p></div>
        <div className="steps-list">
          <article className="step-row"><div className="step-number">01</div><div className="step-title">Bring the context</div><p>Paste a conversation or add a screenshot. Share only the part that matters.</p><div className="step-symbol"><FileImage size={20} /></div></article>
          <article className="step-row"><div className="step-number">02</div><div className="step-title">See another angle</div><p>Get a thoughtful read on the tone, intent, and what might be left unsaid.</p><div className="step-symbol"><Sparkles size={20} /></div></article>
          <article className="step-row"><div className="step-number">03</div><div className="step-title">Make it yours</div><p>Explore a few replies, shape the tone, and keep the words that sound like you.</p><div className="step-symbol"><PenLine size={20} /></div></article>
        </div>
      </section>

      <section className="quote-section">
        <div className="quote-mark">“</div>
        <blockquote>It’s not about finding the perfect thing to say. It’s about feeling okay with what you choose to say.</blockquote>
        <span className="quote-attribution">A note from the ReplyMind team</span>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-orbit"><div className="orbit-ring orbit-ring-a" /><div className="orbit-ring orbit-ring-b" /><div className="privacy-lock"><ShieldCheck size={35} strokeWidth={1.5} /></div><span className="orbit-dot orbit-dot-a" /><span className="orbit-dot orbit-dot-b" /></div>
        <div className="privacy-copy"><span className="section-index">03 — YOURS TO KEEP PRIVATE</span><h2>Your conversations<br />stay <em>yours.</em></h2><p>Your history and preferences stay in this browser. When you request an analysis, the text or screenshot you share is sent to Groq for processing and is not saved on ReplyMind’s server.</p><Link href="/app" className="underlined-link">Start with a little more clarity <ArrowRight size={15} /></Link></div>
      </section>

      <section className="closing-cta"><span className="closing-asterisk"><Sparkles size={24} /></span><span className="section-index">WHEN YOU’RE READY</span><h2>Take the pressure<br />out of the <em>reply.</em></h2><Link href="/app" className="button button-primary button-large">Let’s get started <ArrowRight size={17} /></Link><span className="closing-reassurance">Your voice. A little more clarity.</span></section>
    </main>
    <footer className="site-footer"><Logo /><span>For the words that matter.</span><div><Link href="/app">Open ReplyMind</Link></div><small>© ReplyMind</small></footer>
    {health.isError && <span className="sr-only">Service health status is currently unavailable.</span>}
  </div>;
}

function AppShell({ children, active = 'app' }: { children: ReactNode; active?: 'app' | 'settings' }) {
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Logo />
      <div className="sidebar-label">YOUR SPACE</div>
      <Link href="/app" className={`side-link ${active === 'app' ? 'is-active' : ''}`}><MessageCircle size={17} /> Conversations</Link>
      <Link href="/settings" className={`side-link ${active === 'settings' ? 'is-active' : ''}`}><Settings2 size={17} /> Settings</Link>
      <div className="sidebar-spacer" />
      <div className="sidebar-private"><ShieldCheck size={16} /><span><strong>Saved on this device</strong><small>No account or cross-device sync.</small></span></div>
      <div className="side-profile"><span className="profile-avatar">R</span><span><strong>Your device</strong><small>Saved in this browser</small></span></div>
    </aside>
    <div className="app-main">
      <header className="app-topbar">
        <Logo compact />
        <div className="app-topbar-title">{active === 'settings' ? 'Your settings' : 'Your conversations'}</div>
        <div className="app-topbar-actions"><Link href="/settings" className="mobile-settings" aria-label="Settings"><Settings2 size={19} /></Link></div>
      </header>
      <main className="app-content">{children}</main>
      <nav className="mobile-nav" aria-label="App navigation">
        <Link href="/app" className={active === 'app' ? 'mobile-active' : ''}><MessageCircle size={18} /><span>Chats</span></Link>
        <Link href="/settings" className={active === 'settings' ? 'mobile-active' : ''}><Settings2 size={18} /><span>Settings</span></Link>
      </nav>
    </div>
  </div>;
}

function ConversationComposer() {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const prefs = useGetPreferences();
  const createConversation = useCreateConversation();
  const analyze = useAnalyzeConversation();
  const [text, setText] = useState('');
  const [latestMessage, setLatestMessage] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [retainScreenshot, setRetainScreenshot] = useState(false);
  const [preparingScreenshot, setPreparingScreenshot] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = createConversation.isPending || analyze.isPending || preparingScreenshot;

  const pickFile = async (picked?: File) => {
    if (!picked) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(picked.type)) { setError('Choose a JPG, PNG, or WebP screenshot.'); return; }
    setError('');
    setPreparingScreenshot(true);
    try {
      const optimized = await prepareScreenshot(picked);
      setFile(optimized);
      setRetainScreenshot(false);
    } catch (reason) {
      setFile(null);
      setError(reason instanceof Error ? reason.message : 'The screenshot could not be prepared.');
    } finally {
      setPreparingScreenshot(false);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); pickFile(event.dataTransfer.files[0]); };
  const startAnalysis = async () => {
    setError('');
    if (!text.trim() && !latestMessage.trim() && !file) { setError('Add a conversation or screenshot first.'); return; }
    let conversationId: string | undefined;
    try {
      const created = await createConversation.mutateAsync({ data: { title: title.trim() || (latestMessage.trim() || text.trim()).split('\n')[0].slice(0, 72) || 'A new conversation' } });
      conversationId = created.id;
      await analyze.mutateAsync({ id: created.id, data: {
        ...(text.trim() ? { conversationText: text.trim() } : {}),
        ...(latestMessage.trim() ? { latestMessage: latestMessage.trim() } : {}),
        tone: prefs.data?.defaultTone || 'natural',
        includeEmojis: prefs.data?.includeEmojis ?? false,
        retainScreenshot: retainScreenshot && Boolean(file),
      }, screenshotFile: file ?? undefined });
      await Promise.all([
        client.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
        client.invalidateQueries({ queryKey: getGetConversationQueryKey(created.id) }),
        client.invalidateQueries({ queryKey: getGetUsageQueryKey() }),
      ]);
      setLocation(`/conversation/${created.id}`);
    } catch (reason) {
      if (conversationId) {
        const saved = await getLocalConversation(conversationId).catch(() => undefined);
        if (saved && !saved.analysis) await deleteLocalConversation(conversationId).catch(() => undefined);
      }
      setError(reason instanceof Error ? reason.message : 'Something went wrong. Your draft is still here — try again.');
    }
  };

  return <section className="composer-panel">
    <div className="composer-heading"><span className="eyebrow-small"><Sparkles size={14} /> A FRESH PERSPECTIVE</span><span className="private-label"><LockKeyhole size={12} /> No account or sync</span></div>
    <h2>What’s on your mind?</h2>
    <p className="panel-subtitle">Share the part you keep thinking about. We’ll help you read it with a little more room to breathe.</p>
    <label className="field-label" htmlFor="conversation-title">Give this conversation a name <span>optional</span></label>
    <input id="conversation-title" className="text-input title-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="A name you’ll recognize later" data-testid="input-conversation-title" />
    <label className="field-label" htmlFor="conversation-text">Paste the conversation <span>up to 16,000 characters</span></label>
    <textarea id="conversation-text" className="conversation-input" value={text} maxLength={16000} onChange={(event) => setText(event.target.value)} placeholder={"Paste the messages here — include names or labels if it helps.\n\nYou can keep it short. Just share enough to understand the moment."} data-testid="input-conversation-text" />
    <div className="input-bottom"><span>Your draft is sent only when you request an analysis.</span><span>{text.length.toLocaleString()} / 16,000</span></div>
    <div className="or-divider"><span /> OR <span /></div>
    <div className="latest-field"><div><label htmlFor="latest-message" className="field-label">Just the latest message</label><p>Start with one message if that’s all you have.</p></div><textarea id="latest-message" className="latest-input" value={latestMessage} maxLength={4000} onChange={(event) => setLatestMessage(event.target.value)} placeholder="What did they say?" data-testid="input-latest-message" /></div>
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a conversation screenshot" onChange={(event: ChangeEvent<HTMLInputElement>) => { const picked = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void pickFile(picked); }} data-testid="input-screenshot-file" />
    <div className="upload-drop" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <button type="button" className="upload-button" onClick={() => fileRef.current?.click()} disabled={pending}><span className="upload-icon"><ImagePlus size={19} /></span><span><strong>{preparingScreenshot ? 'Optimizing screenshot…' : file ? file.name : 'Add a screenshot'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ready to analyze` : 'JPG, PNG, or WebP · optimized to 10 MB'}</small></span><Upload size={16} className="upload-arrow" /></button>
       {file && <button type="button" className="remove-file" aria-label="Remove screenshot" onClick={() => { setFile(null); setRetainScreenshot(false); if (fileRef.current) fileRef.current.value = ''; }}><X size={15} /></button>}
    </div>
     {file && <label className="screenshot-retain-option"><input type="checkbox" checked={retainScreenshot} onChange={(event) => setRetainScreenshot(event.target.checked)} /><span><strong>Keep this screenshot with the conversation</strong><small>Off by default. If unchecked, no copy is saved after analysis.</small></span></label>}
    <p className="screenshot-processing-note">Screenshots go to Groq for analysis. A copy stays in this browser only if you switch on “Keep this screenshot.”</p>
    {error && <StatusNote error>{error}</StatusNote>}
    {pending && <div className="progress-message" role="status"><span className="pulse-dot" />{preparingScreenshot ? 'Optimizing your screenshot…' : createConversation.isPending ? 'Making a private space…' : 'Looking at the context…'}</div>}
    <div className="composer-submit-row"><span><LockKeyhole size={13} /> A thoughtful read, not a verdict.</span><Button className="submit-reply" onClick={startAnalysis} disabled={pending || (!text.trim() && !latestMessage.trim() && !file)} data-testid="button-analyze-conversation">{pending ? <><span className="button-loader" /> One moment</> : <>Help me understand <ArrowRight size={16} /></>}</Button></div>
  </section>;
}

function Dashboard() {
  const conversations = useListConversations();
  const [showArchived, setShowArchived] = useState(false);
  const items = conversations.data?.filter((item) => showArchived || !item.isArchived) || [];
  return <AppShell>
    <div className="page-heading dashboard-heading"><div><span className="eyebrow-small">A LITTLE SPACE TO THINK</span><h1>Good to have you here.</h1><p>Let’s take the pressure out of your next reply.</p></div><div className="heading-mark"><MessageCircle size={23} /><span /></div></div>
    <div className="dashboard-grid">
      <div className="primary-column"><ConversationComposer /></div>
      <aside className="history-column">
        <div className="history-title-row"><div><span className="eyebrow-small">YOUR PRIVATE SPACE</span><h2>Recent conversations</h2></div><button className={`history-filter ${showArchived ? 'filter-on' : ''}`} type="button" onClick={() => setShowArchived(!showArchived)} aria-pressed={showArchived} data-testid="button-toggle-archived">{showArchived ? 'All' : 'Saved'} <ChevronDown size={14} /></button></div>
        {conversations.isLoading ? <div className="history-skeleton"><div /><div /><div /></div> :
          conversations.isError ? <div className="empty-history"><StatusNote error>We couldn’t load your conversations.</StatusNote><Button variant="soft" onClick={() => conversations.refetch()}>Try again</Button></div> :
            items.length ? <div className="conversation-list">{items.map((item) => <ConversationRow key={item.id} item={item} />)}</div> :
              <div className="empty-history"><div className="empty-icon"><Clock3 size={20} /></div><strong>{showArchived ? 'Nothing saved away yet' : 'Your space is ready'}</strong><p>{showArchived ? 'Conversations you archive will be here.' : 'Start with the conversation on your mind. You can come back to it whenever you need.'}</p><span className="empty-line" /></div>}
        <div className="history-note"><ShieldCheck size={15} /><span>Saved only in this browser.<br /><b>Not synced to an account.</b></span></div>
      </aside>
    </div>
  </AppShell>;
}

function ConversationRow({ item }: { item: import('@workspace/api-client-react').ConversationSummary }) {
  const update = useUpdateConversation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const time = new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const toggleArchive = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setError('');
    try {
      await update.mutateAsync({ id: item.id, data: { isArchived: !item.isArchived } });
      await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this conversation.'); }
  };
  return <div className="conversation-row-wrap">
    <div className="conversation-row" data-testid={`conversation-${item.id}`}>
      <Link href={`/conversation/${item.id}`} className="conversation-row-main">
        <span className="conversation-symbol"><MessageCircle size={17} /></span><span className="conversation-meta"><strong>{item.title || 'Untitled conversation'}</strong><small>{item.preview || `${item.messageCount} messages`} <i /> {time}</small></span><ArrowRight size={15} className="row-chevron" />
      </Link>
      <button type="button" className="row-action" onClick={toggleArchive} aria-label={item.isArchived ? 'Unarchive conversation' : 'Archive conversation'} title={item.isArchived ? 'Unarchive' : 'Archive'} disabled={update.isPending}><Archive size={15} /></button>
    </div>
    {error && <div className="row-error" role="alert">{error}</div>}
  </div>;
}

function ConversationPage({ id }: { id: string }) {
  const detail = useGetConversation(id, { query: { queryKey: getGetConversationQueryKey(id), enabled: !!id } });
  const prefs = useGetPreferences();
  const client = useQueryClient();
  const update = useUpdateConversation();
  const remove = useDeleteConversation();
  const deleteUpload = useDeleteUpload();
  const analyze = useAnalyzeConversation();
  const rewrite = useRewriteReply();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState('');
  const [rewritePrompts, setRewritePrompts] = useState<Record<string, string>>({});
  const [rewriteOutput, setRewriteOutput] = useState<Record<string, string>>({});
  const [clarificationText, setClarificationText] = useState('');
  const [error, setError] = useState('');
  const conversation = detail.data;
  const invalidate = async () => Promise.all([
    client.invalidateQueries({ queryKey: getGetConversationQueryKey(id) }),
    client.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
  ]);

  const copyReply = async (replyId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(rewriteOutput[replyId] || text);
      setCopied(replyId);
      window.setTimeout(() => setCopied((current) => current === replyId ? '' : current), 1800);
    } catch { setError('Clipboard access is unavailable. Select and copy the reply instead.'); }
  };
  const doRewrite = async (replyId: string) => {
    const instruction = rewritePrompts[replyId]?.trim() || 'Make this sound more natural and like me';
    try {
      setError('');
      const result = await rewrite.mutateAsync({ id: replyId, data: { instruction, includeEmojis: prefs.data?.includeEmojis ?? false } });
      setRewriteOutput((current) => ({ ...current, [replyId]: result.text }));
      await invalidate();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'That rewrite didn’t come through. Try again.'); }
  };
  const changeArchive = async () => {
    if (!conversation) return;
    try { await update.mutateAsync({ id, data: { isArchived: !conversation.isArchived } }); await invalidate(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this conversation.'); }
  };
  const rename = async () => {
    if (!conversation) return;
    const nextTitle = window.prompt('Give this conversation a name', conversation.title);
    if (!nextTitle?.trim() || nextTitle.trim() === conversation.title) return;
    try { await update.mutateAsync({ id, data: { title: nextTitle.trim().slice(0, 120) } }); await invalidate(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not rename this conversation.'); }
  };
  const deleteConversation = async () => {
    if (!window.confirm('Delete this conversation and its saved screenshot? This can’t be undone.')) return;
    try { await remove.mutateAsync({ id }); await client.invalidateQueries({ queryKey: getListConversationsQueryKey() }); setLocation('/app'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this conversation.'); }
  };
  const runAgain = async () => {
    if (!conversation) return;
    try {
      await analyze.mutateAsync({ id, data: {
        previousMessages: conversation.messages,
        screenshotId: conversation.screenshot?.id || undefined,
        contextClarification: clarificationText.trim() || undefined,
        tone: prefs.data?.defaultTone || 'natural',
        includeEmojis: prefs.data?.includeEmojis ?? false,
      } });
      await Promise.all([invalidate(), client.invalidateQueries({ queryKey: getGetUsageQueryKey() })]);
      setClarificationText('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'We couldn’t take another look right now.'); }
  };
  const removeScreenshot = async () => {
    if (!conversation?.screenshot || !window.confirm('Remove this saved screenshot?')) return;
    try {
      await deleteUpload.mutateAsync({ id: conversation.screenshot.id });
      await client.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove the screenshot.'); }
  };

  return <AppShell>
    <div className="conversation-top"><Link href="/app" className="back-link"><ArrowLeft size={16} /> All conversations</Link><div className="conversation-toolbar"><button onClick={rename} className="icon-button" aria-label="Rename conversation" title="Rename"><PenLine size={17} /></button><button onClick={changeArchive} className="icon-button" aria-label={conversation?.isArchived ? 'Unarchive conversation' : 'Archive conversation'} title={conversation?.isArchived ? 'Unarchive' : 'Archive'}><Archive size={17} /></button><button onClick={deleteConversation} className="icon-button icon-danger" aria-label="Delete conversation" title="Delete"><Trash2 size={17} /></button></div></div>
    {detail.isLoading ? <div className="conversation-loading"><div /><div /><div /><div /></div> :
      detail.isError ? <div className="detail-error"><span className="empty-icon"><MessageCircle size={20} /></span><h2>We couldn’t open this conversation.</h2><p>It may have been removed, or the connection may have slipped.</p><Button variant="soft" onClick={() => detail.refetch()}>Try again</Button></div> :
        conversation && <div className="detail-layout">
          <div className="detail-main">
            <div className="detail-title"><span className="eyebrow-small">{conversation.isArchived ? 'SAVED CONVERSATION' : 'YOUR CONVERSATION'}</span><h1>{conversation.title}</h1><p><Clock3 size={14} /> Updated {new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} <i /> {conversation.messageCount} messages</p></div>
            {error && <StatusNote error>{error}</StatusNote>}
            <section className="analysis-card">
              <div className="analysis-heading"><div className="insight-icon"><Sparkles size={18} /></div><div><span className="eyebrow-small">A THOUGHTFUL READ</span><h2>What might be going on</h2></div></div>
            {conversation.analysis ? <div className="analysis-copy">
                <p className="analysis-summary">{conversation.analysis.summary}</p>
                <div className="context-grid"><div className="context-item"><span>THE TONE</span><p>{conversation.analysis.tone}</p></div><div className="context-item"><span>THE CONTEXT</span><p>{conversation.analysis.relationshipContext}</p></div><div className="context-item"><span>THE POSSIBLE INTENT</span><p>{conversation.analysis.intent}</p></div></div>
                {conversation.analysis.needsClarification && <div className="clarification-box"><strong>Help us understand what was missed</strong><p>Add the unreadable or missing words below. This clarification stays in this browser and is sent with your next analysis request.</p><label className="sr-only" htmlFor="analysis-clarification">Add missing conversation details</label><textarea id="analysis-clarification" value={clarificationText} onChange={(event) => setClarificationText(event.target.value)} maxLength={4000} placeholder="What did the message say, or what context should ReplyMind know?" /><Button variant="soft" onClick={runAgain} disabled={analyze.isPending || !clarificationText.trim()}>{analyze.isPending ? 'Taking another look…' : 'Try again with this detail'}</Button></div>}
              </div> : <div className="analysis-empty"><p>No read on this one yet. You can take another look whenever you’re ready.</p><Button variant="soft" onClick={runAgain} disabled={analyze.isPending}>{analyze.isPending ? 'Taking a look…' : <><RotateCcw size={15} /> Analyze conversation</>}</Button></div>}
            </section>
            {conversation.messages.length > 0 && <section className="message-context"><div className="section-title-row"><div><span className="eyebrow-small">THE CONTEXT</span><h2>Messages shared</h2></div><span className="context-count">{conversation.messages.length} messages</span></div><div className="message-stack">{conversation.messages.map((message) => <div className={`context-message ${message.speaker === 'me' ? 'context-me' : ''}`} key={message.id}><span className="speaker-label">{message.speaker === 'me' ? 'YOU' : message.speaker === 'them' ? 'THEM' : 'MESSAGE'}</span><p>{message.content}</p></div>)}</div></section>}
            {conversation.screenshot && <section className="saved-image"><span className="saved-image-icon"><FileImage size={17} /></span><span><strong>{conversation.screenshot.fileName}</strong><small>{(conversation.screenshot.size / 1024 / 1024).toFixed(1)} MB · saved in this browser</small></span><button className="icon-button icon-danger" aria-label="Remove saved screenshot" onClick={removeScreenshot} disabled={deleteUpload.isPending}><Trash2 size={16} /></button></section>}
          </div>
          <aside className="reply-column"><div className="reply-header"><span className="eyebrow-small"><Sparkles size={13} /> YOUR NEXT WORDS</span><h2>Replies that sound like you.</h2><p>Pick one as a starting point. You can always make it your own.</p></div>
            {conversation.analysis?.suggestions?.length ? <div className="reply-options">{conversation.analysis.suggestions.map((suggestion) => <article className="reply-card" key={suggestion.id}>
              <div className="reply-card-top"><span className="tone-chip">{suggestion.tone}</span><span className="reply-tag">OPTION</span></div><p className="reply-text">{rewriteOutput[suggestion.id] || suggestion.text}</p>
              <div className="rewrite-control"><label className="sr-only" htmlFor={`rewrite-${suggestion.id}`}>Adjust this reply</label><input id={`rewrite-${suggestion.id}`} value={rewritePrompts[suggestion.id] || ''} onChange={(event) => setRewritePrompts((current) => ({ ...current, [suggestion.id]: event.target.value }))} placeholder="Ask for a small change…" maxLength={200} /><button onClick={() => doRewrite(suggestion.id)} disabled={rewrite.isPending} aria-label="Rewrite this reply" title="Rewrite"><RotateCcw size={14} /></button></div>
              <button className={`copy-reply ${copied === suggestion.id ? 'copied' : ''}`} onClick={() => copyReply(suggestion.id, suggestion.text)}><span>{copied === suggestion.id ? <><Check size={15} /> Copied</> : <><Clipboard size={15} /> Copy reply</>}</span><ArrowRight size={15} /></button>
            </article>)}</div> : !conversation.analysis ? <div className="reply-empty"><div className="empty-icon"><MessageCircle size={18} /></div><p>Your reply ideas will appear here after a conversation read.</p></div> : <div className="reply-empty"><div className="empty-icon"><MessageCircle size={18} /></div><p>No reply options were returned this time.</p></div>}
            {conversation.analysis && <button className="try-again-link" onClick={runAgain} disabled={analyze.isPending}>{analyze.isPending ? 'Looking again…' : <><RotateCcw size={14} /> See a fresh perspective</>}</button>}
            <div className="reply-reminder"><LockKeyhole size={14} /><span>These are ideas, not instructions.<br /><b>Your voice comes first.</b></span></div>
          </aside>
        </div>}
  </AppShell>;
}

function SettingsPage() {
  const prefs = useGetPreferences();
  const usage = useGetUsage();
  const conversations = useListConversations();
  const updatePrefs = useUpdatePreferences();
  const updateConversation = useUpdateConversation();
  const deleteConversation = useDeleteConversation();
  const clearLocalData = useClearLocalData();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const appearance = prefs.data?.appearance || 'system';
  useEffect(() => {
    const appearanceClass = prefs.data?.appearance === 'dark' || (prefs.data?.appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', !!appearanceClass);
  }, [prefs.data?.appearance]);

  const savePreference = async (data: { defaultTone?: ReplyTone; includeEmojis?: boolean; appearance?: UserPreferenceAppearance }) => {
    setMessage('');
    try {
      await updatePrefs.mutateAsync({ data });
      await client.invalidateQueries({ queryKey: getGetPreferencesQueryKey() });
      if (data.appearance) document.documentElement.classList.toggle('dark', data.appearance === 'dark' || (data.appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
      setMessage('Preference saved.');
      window.setTimeout(() => setMessage(''), 2400);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save your preference.'); }
  };
  const archive = async (id: string, isArchived: boolean) => {
    try {
      await updateConversation.mutateAsync({ id, data: { isArchived: !isArchived } });
      await client.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not update that conversation.'); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this conversation permanently?')) return;
    try { await deleteConversation.mutateAsync({ id }); await client.invalidateQueries({ queryKey: getListConversationsQueryKey() }); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not delete that conversation.'); }
  };
  const clearData = async () => {
    if (!window.confirm('Delete all conversations, saved screenshots, usage counts, and preferences from this browser? This cannot be undone.')) return;
    try {
      await clearLocalData.mutateAsync();
      await client.invalidateQueries();
      setMessage('All ReplyMind data was deleted from this browser.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not clear local data.'); }
  };
  const isUpdating = updatePrefs.isPending || updateConversation.isPending || deleteConversation.isPending || clearLocalData.isPending;

  return <AppShell active="settings">
    <div className="page-heading settings-heading"><div><span className="eyebrow-small">MAKE THIS SPACE YOURS</span><h1>Your settings</h1><p>Small preferences, kept just for you.</p></div><div className="heading-mark"><Settings2 size={22} /></div></div>
    {message && <StatusNote error={message.toLowerCase().includes('could not')}>{message}</StatusNote>}
    {prefs.isLoading && <div className="settings-skeleton"><div /><div /><div /></div>}
    {prefs.isError && <StatusNote error>We couldn’t load your preferences. <button className="inline-action" onClick={() => prefs.refetch()}>Try again</button></StatusNote>}
    <div className="settings-layout">
      <div className="settings-primary">
        <section className="settings-card profile-card"><div className="settings-section-heading"><div className="settings-icon"><Heart size={18} /></div><div><h2>This browser</h2><p>No account or sign-in is used.</p></div></div>
          <div className="profile-line"><span className="profile-avatar">R</span><span><strong>Local ReplyMind space</strong><small>Conversations and preferences stay on this device.</small></span><span className="profile-managed"><LockKeyhole size={12} /> device only</span></div>
        </section>
        <section className="settings-card"><div className="settings-section-heading"><div className="settings-icon"><MessageCircle size={18} /></div><div><h2>Your reply style</h2><p>Choose the starting tone you reach for most.</p></div></div>
          <div className="tone-settings">{tones.map((tone) => <button type="button" key={tone.value} className={`tone-setting ${prefs.data?.defaultTone === tone.value ? 'tone-selected' : ''}`} onClick={() => savePreference({ defaultTone: tone.value })} disabled={isUpdating} aria-pressed={prefs.data?.defaultTone === tone.value} data-testid={`button-tone-${tone.value}`}><span className="tone-radio">{prefs.data?.defaultTone === tone.value && <Check size={12} />}</span><span><strong>{tone.label}</strong><small>{tone.note}</small></span></button>)}</div>
          <div className="preference-divider" />
          <div className="setting-toggle-row"><div><strong>Include emojis in suggestions</strong><p>Reply options can include emojis when it fits your style.</p></div><button role="switch" aria-checked={prefs.data?.includeEmojis ?? false} aria-label="Include emojis in suggestions" className={`switch ${prefs.data?.includeEmojis ? 'switch-on' : ''}`} disabled={isUpdating} onClick={() => savePreference({ includeEmojis: !(prefs.data?.includeEmojis ?? false) })} data-testid="toggle-include-emojis"><span /></button></div>
        </section>
        <section className="settings-card"><div className="settings-section-heading"><div className="settings-icon"><Sun size={18} /></div><div><h2>Appearance</h2><p>Choose what feels easy on your eyes.</p></div></div>
          <div className="appearance-options">{(['system', 'light', 'dark'] as UserPreferenceAppearance[]).map((choice) => <button key={choice} onClick={() => savePreference({ appearance: choice })} disabled={isUpdating} className={`appearance-choice ${appearance === choice ? 'appearance-selected' : ''}`} aria-pressed={appearance === choice} data-testid={`button-appearance-${choice}`}>{choice === 'dark' ? <Moon size={16} /> : choice === 'light' ? <Sun size={16} /> : <Settings2 size={16} />}<span>{choice[0].toUpperCase() + choice.slice(1)}</span>{appearance === choice && <Check size={14} />}</button>)}</div>
        </section>
        <section className="settings-card privacy-card"><div className="settings-section-heading"><div className="settings-icon"><ShieldCheck size={18} /></div><div><h2>Your privacy</h2><p>Your data stays in this browser.</p></div></div><div className="privacy-points"><div><LockKeyhole size={15} /><span><strong>History is stored on this device</strong><small>It is not synced to an account or saved on the ReplyMind server.</small></span></div><div><FileImage size={15} /><span><strong>Images are sent only when you request analysis</strong><small>Groq processes the screenshot; saved copies stay in this browser.</small></span></div></div><Button variant="danger" onClick={clearData} disabled={isUpdating}>{clearLocalData.isPending ? 'Clearing this browser…' : 'Delete all local ReplyMind data'}</Button></section>
      </div>
      <aside className="settings-aside">
        <section className="usage-card"><span className="eyebrow-small">YOUR MONTHLY RHYTHM</span><h2>This browser</h2>{usage.isLoading ? <div className="usage-skeleton" /> : usage.isError ? <StatusNote error>Usage isn’t available right now.</StatusNote> : usage.data && <><p className="usage-month">{usage.data.month} · counts stay on this device</p><div className="usage-meter"><div className="usage-label"><span>Conversation reads</span><b>{usage.data.generations} / {usage.data.generationLimit}</b></div><div className="meter-track"><i style={{ width: `${usage.data.generationLimit ? Math.min(100, usage.data.generations / usage.data.generationLimit * 100) : 0}%` }} /></div></div><div className="usage-meter"><div className="usage-label"><span>Image analyses</span><b>{usage.data.imageAnalyses} / {usage.data.imageAnalysisLimit}</b></div><div className="meter-track coral-meter"><i style={{ width: `${usage.data.imageAnalysisLimit ? Math.min(100, usage.data.imageAnalyses / usage.data.imageAnalysisLimit * 100) : 0}%` }} /></div></div><div className="storage-used"><span>Screenshots on this device</span><strong>{(usage.data.storageBytes / (1024 * 1024)).toFixed(1)} / {(usage.data.storageLimitBytes / (1024 * 1024)).toFixed(0)} MB</strong></div><p className="usage-month">Local limits can be reset by clearing browser data.</p></>}</section>
        <section className="settings-card saved-controls"><div className="settings-section-heading"><div className="settings-icon"><Archive size={17} /></div><div><h2>Saved conversations</h2><p>Archive or remove a conversation.</p></div></div>
          {conversations.isLoading ? <div className="saved-skeleton"><div /><div /></div> : conversations.isError ? <StatusNote error>Couldn’t load saved conversations. <button className="inline-action" onClick={() => conversations.refetch()}>Retry</button></StatusNote> : conversations.data?.length ? <div className="saved-list">{conversations.data.map((item) => <div className="saved-row" key={item.id}><Link href={`/conversation/${item.id}`} className="saved-row-title"><strong>{item.title || 'Untitled conversation'}</strong><small>{item.isArchived ? 'Archived' : 'Active'}</small></Link><button className="saved-control" onClick={() => archive(item.id, item.isArchived)} aria-label={item.isArchived ? `Unarchive ${item.title}` : `Archive ${item.title}`} disabled={isUpdating}><Archive size={14} /></button><button className="saved-control saved-delete" onClick={() => remove(item.id)} aria-label={`Delete ${item.title}`} disabled={isUpdating}><Trash2 size={14} /></button></div>)}</div> : <div className="settings-empty">Your saved conversations will appear here.</div>}
        </section>
      </aside>
    </div>
  </AppShell>;
}

function AppRoutes() {
  return <Switch>
      <Route path="/" component={Landing} />
      <Route path="/app" component={Dashboard} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/conversation/:id" component={({ params }) => <ConversationPage id={params.id} />} />
      <Route component={NotFound} />
  </Switch>;
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register(fullPath('sw.js')).catch(() => undefined);
    }
  }, []);
  return <QueryClientProvider client={queryClient}>
    <Router base={basePath}>
      <AppRoutes />
    </Router>
  </QueryClientProvider>;
}

export default App;