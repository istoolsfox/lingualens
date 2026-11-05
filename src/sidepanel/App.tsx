// ============================================================
// sidepanel/App.tsx —— 侧边栏外壳：视图切换 / 主题 / 首次隐私卡
// ============================================================

import { useEffect } from 'react';
import { useStore } from './store';
import { AnalysisView } from './views/AnalysisView';
import { ArticleView } from './views/ArticleView';
import { LibraryView } from './views/LibraryView';
import { PracticeView } from './views/PracticeView';
import { Btn } from './components/bits';

export default function App() {
  const st = useStore();

  useEffect(() => {
    void st.init();
  }, []);

  const needsPrivacy = st.ready && !st.settings.privacyAcknowledgedAt;

  return (
    <div className="relative flex h-full flex-col">
      <Header />
      {!st.ready ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {st.view === 'analysis' && <AnalysisView />}
          {st.view === 'article' && <ArticleView />}
          {st.view === 'library' && <LibraryView />}
          {st.view === 'practice' && <PracticeView />}
        </div>
      )}
      {needsPrivacy && <PrivacyCard />}
    </div>
  );
}

function Header() {
  const st = useStore();

  const tabBtn = (key: 'analysis' | 'library' | 'practice', label: string) => (
    <button
      type="button"
      onClick={() => st.setView(key)}
      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        st.view === key
          ? 'bg-accent-600 text-white'
          : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
      <span className="text-sm font-bold text-accent-600 dark:text-accent-300">LinguaLens</span>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 rounded-lg bg-ink-100 p-0.5 dark:bg-ink-900">
        {tabBtn('analysis', '精读')}
        {tabBtn('library', '知识库')}
        {tabBtn('practice', '训练')}
      </div>
      <Btn
        onClick={() => {
          void chrome.runtime.openOptionsPage();
        }}
        title="设置"
      >
        ⚙
      </Btn>
    </div>
  );
}

function PrivacyCard() {
  const st = useStore();
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[320px] rounded-xl border border-ink-200 bg-white p-4 shadow-xl dark:border-ink-700 dark:bg-ink-900">
        <h2 className="text-sm font-bold">欢迎使用 LinguaLens</h2>
        <div className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-600 dark:text-ink-300">
          <p>开始前请了解数据流向：</p>
          <p>
            1. 选中分析时，仅发送<b>选中的文本、其前后约 300 字上下文、页面标题与网址</b>给模型服务。
          </p>
          <p>
            2. API 密钥经 <b>AES-256-GCM 加密</b>后保存在本机浏览器内，不会上传到任何第三方。
          </p>
          <p>3. 收藏、笔记、练习记录全部存在本地 IndexedDB，可随时导出或清除。</p>
          <p className="text-ink-400 dark:text-ink-500">
            注：本地加密可防密钥明文泄露；若设备本身已被控制则无法防御。公开发布版建议改用服务端代理。
          </p>
        </div>
        <Btn variant="primary" className="mt-3 w-full py-2" onClick={() => void st.acknowledgePrivacy()}>
          我已了解，开始使用
        </Btn>
      </div>
    </div>
  );
}
