import { useState, useCallback, useEffect, useRef } from 'react';
import Viewer3D from './components/Viewer3D';
import { searchPrebuilt, searchFallback, getPopularConcepts } from './utils/conceptEngine';
import type { SearchResult, ConceptComponent } from './utils/conceptEngine';
import { generateWithAI, hasApiKey, getApiKey, setApiKey as saveApiKey } from './utils/aiModelGenerator';

function App() {
  const [isDark, setIsDark] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [hoveredComponent, setHoveredComponent] = useState<ConceptComponent | null>(null);
  const [simpleMode, setSimpleMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [animatingSteps, setAnimatingSteps] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());
  const [aiStatus, setAiStatus] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const stepsTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const animateSteps = useCallback((steps: string[], onComplete: () => void) => {
    stepsTimerRef.current.forEach(t => clearTimeout(t));
    stepsTimerRef.current = [];

    steps.forEach((step, i) => {
      const timer = setTimeout(() => {
        setAnimatingSteps(prev => [...prev, step]);
      }, (i + 1) * 250);
      stepsTimerRef.current.push(timer);
    });

    const finalTimer = setTimeout(onComplete, (steps.length + 1) * 250);
    stepsTimerRef.current.push(finalTimer);
  }, []);

  const handleSearch = useCallback(async (query?: string) => {
    const searchTerm = query || searchInput;
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setResult(null);
    setShowSteps(true);
    setAnimatingSteps([]);
    setAiStatus('');

    if (query) setSearchInput(query);

    // Step 1: Try pre-built models first (synchronous)
    const prebuilt = searchPrebuilt(searchTerm);
    if (prebuilt) {
      animateSteps(prebuilt.processingSteps, () => {
        setResult(prebuilt);
        setIsSearching(false);
      });
      return;
    }

    // Step 2: Try AI generation if API key is available
    if (hasApiKey()) {
      const aiSteps = [
        '✓ Analyzed input concept',
        '✓ No pre-built model found in database',
        '✓ Searching semantic matches...',
        '✓ No close match found',
        '🤖 Connecting to Gemini AI...',
        '🧠 AI is designing 3D model blueprint...',
      ];

      aiSteps.forEach((step, i) => {
        const timer = setTimeout(() => {
          setAnimatingSteps(prev => [...prev, step]);
        }, (i + 1) * 300);
        stepsTimerRef.current.push(timer);
      });

      setAiStatus('Generating with Gemini AI...');

      // Wait for initial animation then call AI
      await new Promise(r => setTimeout(r, aiSteps.length * 300 + 200));

      const aiResult = await generateWithAI(searchTerm);

      if (aiResult.success && aiResult.concept) {
        const finalSteps = aiResult.fromCache
          ? ['✓ Found cached AI model', '✓ Loaded from cache instantly']
          : [
              `✓ AI generated ${aiResult.concept.components.length} components`,
              '✓ Validated model structure',
              '✓ Applied materials and lighting',
              '✓ 3D model ready!',
            ];

        finalSteps.forEach((step, i) => {
          const timer = setTimeout(() => {
            setAnimatingSteps(prev => [...prev, step]);
          }, (i + 1) * 200);
          stepsTimerRef.current.push(timer);
        });

        const completeTimer = setTimeout(() => {
          setResult({
            concept: aiResult.concept!,
            confidence: aiResult.fromCache ? 88 : 85,
            matchType: 'ai-generated',
            searchSources: [
              'Google Gemini AI',
              'AI 3D Blueprint Generator',
              'Geometric Composition Engine',
              aiResult.fromCache ? 'Local Model Cache' : 'Real-time Generation',
            ],
            processingSteps: [
              ...aiSteps,
              ...finalSteps,
            ],
          });
          setIsSearching(false);
          setAiStatus('');
        }, (finalSteps.length + 1) * 200);
        stepsTimerRef.current.push(completeTimer);
        return;
      }

      // AI failed — show error, fall through to procedural
      setAnimatingSteps(prev => [...prev, `⚠ AI generation failed: ${aiResult.error}`]);
      setAnimatingSteps(prev => [...prev, '↓ Falling back to procedural generation...']);
      await new Promise(r => setTimeout(r, 800));
    }

    // Step 3: Fallback to procedural generation
    const fallback = searchFallback(searchTerm);
    const remainingSteps = hasApiKey()
      ? fallback.processingSteps.slice(2) // skip first 2 since AI already showed them
      : fallback.processingSteps;

    remainingSteps.forEach((step, i) => {
      const timer = setTimeout(() => {
        setAnimatingSteps(prev => [...prev, step]);
      }, (i + 1) * 250);
      stepsTimerRef.current.push(timer);
    });

    const fallbackTimer = setTimeout(() => {
      setResult(fallback);
      setIsSearching(false);
      setAiStatus('');
    }, (remainingSteps.length + 1) * 250);
    stepsTimerRef.current.push(fallbackTimer);

  }, [searchInput, animateSteps]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const speakDescription = () => {
    if (!result) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(result.concept.detailedExplanation);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'from-emerald-500 to-green-400';
    if (confidence >= 70) return 'from-blue-500 to-cyan-400';
    if (confidence >= 50) return 'from-amber-500 to-yellow-400';
    return 'from-orange-500 to-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 90) return 'Excellent Match';
    if (confidence >= 70) return 'Good Match';
    if (confidence >= 50) return 'Approximate';
    return 'AI Generated';
  };

  const getMatchBadge = (matchType: string) => {
    switch (matchType) {
      case 'exact': return { label: 'Exact Match', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'partial': return { label: 'Semantic Match', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'ai-generated': return { label: '🤖 Gemini AI', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' };
      case 'generated': return { label: 'Procedural', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      default: return { label: 'Unknown', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
    }
  };

  const handleSaveApiKey = () => {
    saveApiKey(apiKeyInput);
    setShowSettings(false);
  };

  const popularConcepts = getPopularConcepts();

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      isDark
        ? 'bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950 text-white'
        : 'bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-gray-900'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-gray-950/70 border-white/10' : 'bg-white/70 border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                  Concept-to-3D
                </span>
              </h1>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Visualization Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Simple Mode Toggle */}
            <button
              onClick={() => setSimpleMode(!simpleMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                simpleMode
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                  : isDark
                    ? 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    : 'bg-black/5 border-gray-200 text-gray-500 hover:bg-black/10'
              }`}
            >
              {simpleMode ? '◇ Simple' : '◆ Detailed'}
            </button>

            {/* Settings (API Key) */}
            <button
              onClick={() => { setApiKeyInput(getApiKey()); setShowSettings(true); }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 text-gray-400'
                  : 'bg-black/5 hover:bg-black/10 text-gray-700'
              }`}
              title="Settings — API Key"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              {hasApiKey() && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-gray-950"></span>
              )}
            </button>

            {/* Theme Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 text-yellow-300'
                  : 'bg-black/5 hover:bg-black/10 text-gray-700'
              }`}
            >
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Section */}
        <div className={`text-center mb-8 ${result ? '' : 'pt-16 pb-8'}`}>
          {!result && (
            <div className="mb-8">
              <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                  Visualize Any Concept in 3D
                </span>
              </h2>
              <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Enter any concept, object, structure, scientific term, or abstract idea.
                Our AI will find or generate the perfect 3D visualization.
              </p>
            </div>
          )}

          <div className="max-w-2xl mx-auto relative">
            <div className={`flex items-center rounded-2xl border-2 transition-all overflow-hidden shadow-2xl ${
              isDark
                ? 'bg-gray-900/80 border-white/10 focus-within:border-blue-500/50 shadow-blue-500/5'
                : 'bg-white border-gray-200 focus-within:border-blue-500/50 shadow-blue-500/10'
            }`}>
              <div className="pl-5 pr-2">
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Try: Atom, Taj Mahal, DNA, Solar System, Volcano, Brain..."
                className={`flex-1 py-4 px-2 text-lg bg-transparent outline-none ${
                  isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
                }`}
              />
              <button
                onClick={() => handleSearch()}
                disabled={isSearching || !searchInput.trim()}
                className={`m-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                  isSearching
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
                }`}
              >
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Analyzing...
                  </span>
                ) : 'Visualize'}
              </button>
            </div>
          </div>

          {/* Popular concepts */}
          {!result && (
            <div className="mt-8 max-w-3xl mx-auto">
              <p className={`text-sm mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Popular concepts:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {popularConcepts.slice(0, 16).map((concept) => (
                  <button
                    key={concept}
                    onClick={() => handleSearch(concept)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all border ${
                      isDark
                        ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    {concept}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Processing Steps Animation */}
        {isSearching && showSteps && (
          <div className={`max-w-2xl mx-auto mb-8 rounded-2xl border p-6 ${
            isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold">AI Processing Pipeline</h3>
                {aiStatus && (
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>{aiStatus}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {animatingSteps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm animate-fadeIn ${
                    step.startsWith('⚠') ? (isDark ? 'text-amber-400' : 'text-amber-600') :
                    step.startsWith('🤖') || step.startsWith('🧠') ? (isDark ? 'text-violet-400' : 'text-violet-600') :
                    isDark ? 'text-gray-300' : 'text-gray-600'
                  }`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <span className={step.startsWith('⚠') ? 'text-amber-400' : step.startsWith('🤖') || step.startsWith('🧠') ? 'text-violet-400' : 'text-green-400'}>●</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results Section */}
        {result && !isSearching && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 3D Viewer - Main Panel */}
            <div className="lg:col-span-2 space-y-4">
              <div className={`rounded-2xl border overflow-hidden ${
                isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
              }`}>
                <div className="p-4 flex items-center justify-between border-b ${isDark ? 'border-white/10' : 'border-gray-200'}">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg">{result.concept.name}</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${getMatchBadge(result.matchType).color}`}>
                      {getMatchBadge(result.matchType).label}
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full ${
                      isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {result.concept.category}
                    </span>
                  </div>
                </div>
                <div className="h-[500px]">
                  <Viewer3D
                    concept={result.concept}
                    isDark={isDark}
                    simpleMode={simpleMode}
                    onComponentHover={setHoveredComponent}
                  />
                </div>

                {/* Component highlight tooltip */}
                {hoveredComponent && (
                  <div className={`mx-4 mb-4 p-3 rounded-xl border flex items-center gap-3 ${
                    isDark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div
                      className="w-4 h-4 rounded-full border-2 border-white/30 flex-shrink-0"
                      style={{ backgroundColor: hoveredComponent.color }}
                    />
                    <div>
                      <p className="font-semibold text-sm">{hoveredComponent.name}</p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {hoveredComponent.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Components List */}
              <div className={`rounded-2xl border p-5 ${
                isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
              }`}>
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                  Model Components ({result.concept.components.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {result.concept.components.map((comp, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                        isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                        style={{ backgroundColor: comp.color }}
                      />
                      <span className="truncate">{comp.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="space-y-4">
              {/* Confidence Score */}
              <div className={`rounded-2xl border p-5 ${
                isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
              }`}>
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  AI Confidence Score
                </h3>
                <div className="relative flex items-center justify-center mb-4">
                  <div className="relative w-36 h-36">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke={isDark ? '#1e293b' : '#e2e8f0'} strokeWidth="8"/>
                      <circle
                        cx="50" cy="50" r="42"
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        stroke="url(#confidenceGradient)"
                        strokeDasharray={`${result.confidence * 2.64} 264`}
                        className="transition-all duration-1000"
                      />
                      <defs>
                        <linearGradient id="confidenceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3b82f6"/>
                          <stop offset="100%" stopColor="#8b5cf6"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold">{result.confidence}%</span>
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getConfidenceLabel(result.confidence)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getConfidenceColor(result.confidence)} transition-all duration-1000`}
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
              </div>

              {/* Search Sources */}
              <div className={`rounded-2xl border p-5 ${
                isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
              }`}>
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9"/>
                  </svg>
                  Search Sources
                </h3>
                <div className="space-y-2">
                  {result.searchSources.map((source, i) => (
                    <div key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                      isDark ? 'bg-white/5' : 'bg-gray-50'
                    }`}>
                      <span className="text-green-400">✓</span>
                      {source}
                    </div>
                  ))}
                </div>
              </div>

              {/* Processing Steps */}
              <div className={`rounded-2xl border p-5 ${
                isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
              }`}>
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  Processing Pipeline
                </h3>
                <div className="space-y-1.5">
                  {result.processingSteps.map((step, i) => (
                    <div key={i} className={`text-xs px-2 py-1.5 rounded ${
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              {/* Explanation Panel */}
              <div className={`rounded-2xl border p-5 ${
                isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    Explanation
                  </h3>
                  <button
                    onClick={speakDescription}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSpeaking
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : isDark
                          ? 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200'
                    }`}
                  >
                    {isSpeaking ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                        </svg>
                        Stop
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                        Listen
                      </>
                    )}
                  </button>
                </div>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {result.concept.description}
                </p>
                <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {result.concept.detailedExplanation}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !isSearching && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                ),
                title: 'Smart Search',
                desc: 'Search any concept - from scientific terms to historical monuments. Our AI finds the best 3D representation.'
              },
              {
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                ),
                title: 'AI 3D Generation',
                desc: 'If no model exists, our AI generates an approximate 3D visualization using geometric primitives.'
              },
              {
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                ),
                title: 'Learn & Explore',
                desc: 'Interactive 3D viewer with audio explanations, component highlighting, and detailed descriptions.'
              }
            ].map((feature, i) => (
              <div
                key={i}
                className={`p-6 rounded-2xl border text-center transition-all hover:scale-105 ${
                  isDark
                    ? 'bg-gray-900/30 border-white/5 hover:border-white/20'
                    : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-lg'
                }`}
              >
                <div className={`w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center ${
                  isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-500'
                }`}>
                  {feature.icon}
                </div>
                <h3 className="font-bold mb-2">{feature.title}</h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
            isDark ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-2 ${
                  isDark ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  🤖 Gemini API Key
                </label>
                <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Add your Google Gemini API key to enable unlimited AI-powered 3D model generation for any concept.
                  Get a free key at{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    aistudio.google.com
                  </a>
                </p>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIza..."
                  className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${
                    isDark
                      ? 'bg-gray-800 border-white/10 text-white focus:border-blue-500/50 placeholder-gray-600'
                      : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 placeholder-gray-400'
                  }`}
                />
              </div>

              {hasApiKey() && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                  isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  <span>✓</span>
                  <span>API key configured — unlimited 3D generation is active</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveApiKey}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                      : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
              </div>

              <p className={`text-xs text-center ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                🔒 Your API key is stored locally and never sent to any server except Google's API.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className={`mt-12 py-6 border-t text-center text-sm ${
        isDark ? 'border-white/5 text-gray-600' : 'border-gray-200 text-gray-400'
      }`}>
        <p>Concept-to-3D Visualization Intelligence • AI-Powered Educational Platform</p>
        <p className="mt-1 text-xs">
          Powered by Three.js • Google Gemini AI • Unlimited Concept Support
        </p>
      </footer>
    </div>
  );
}

export default App;
