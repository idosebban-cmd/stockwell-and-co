import { useMemo, useState } from 'react';
import { recommendedSetup } from './sim/engine';
import { getStorage } from './sim/save';
import { CORE_LESSONS, LESSONS } from './sim/tutorial';
import { useGame } from './ui/useGame';
import { StatusBar } from './ui/StatusBar';
import { GamePanel, runNote } from './ui/PlanPanel';
import { ReplayPanel, SummaryCard } from './ui/ResultsPanel';
import { GameTools } from './ui/ActionTools';
import { Setup } from './ui/Setup';
import { Closing } from './ui/Closing';
import { Help, Menu, SettingsDialog } from './ui/Dialogs';
import { ShopScreen } from './ui/ShopScreen';
import { basicsDone, LessonPanel, lessonPrimary, useTutorial } from './ui/Tutorial';

export default function App() {
  const game = useGame();
  const storage = useMemo(() => getStorage(), []);
  const tutorial = useTutorial(storage, game.settings.skipReplay);
  const [mode, setMode] = useState<'game' | 'tutorial'>(() => (tutorial.progress.active ? 'tutorial' : 'game'));
  const [dialog, setDialog] = useState<null | 'help' | 'settings' | 'menu'>(null);
  const reduced = game.settings.reducedMotion || prefersReducedMotion();
  const inProgress = !!game.state && game.record.plans.length > 0 && game.phase !== 'closed';
  const returning = basicsDone(tutorial.progress) || inProgress;

  const learn = () => {
    tutorial.begin(0);
    setMode('tutorial');
    setDialog(null);
  };
  const exitTutorial = () => {
    tutorial.exit();
    setMode('game');
  };
  const fullSaturday = () => {
    tutorial.exit();
    setMode('game');
    if (!inProgress) {
      game.playCurated();
      game.confirmSetup(recommendedSetup());
    }
  };

  const t = tutorial;
  const gamePrimary = () => {
    if (game.phase === 'replay') return { label: 'Skip replay ▶', onClick: game.finishReplay };
    if (game.phase === 'results') return { label: 'Close up and count the takings ▶', onClick: game.continueAfterResults };
    if (game.phase === 'plan' && game.state && game.draft) {
      const n = runNote(game.state, game.draft);
      return { label: "Run next hour ▶", onClick: game.runNextHour, disabled: n.disabled, note: n.note, noteTone: n.tone };
    }
    return null;
  };
  const lessonLabel = t.lesson.optional
    ? `Pricing ${t.index - CORE_LESSONS + 1} of ${LESSONS.length - CORE_LESSONS} · ${t.lesson.title}`
    : `Lesson ${t.index + 1} of ${CORE_LESSONS} · ${t.lesson.title}`;

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      {mode === 'tutorial' ? (
        <>
          <StatusBar
            state={null}
            tutorial={{ label: lessonLabel, progress: Math.min(t.index, CORE_LESSONS) / CORE_LESSONS, onExit: exitTutorial }}
            saveOk={game.saveOk}
            onHelp={() => setDialog('help')}
            onSettings={() => setDialog('settings')}
            onMenu={() => setDialog('menu')}
          />
          <ShopScreen
            key={`lesson-${t.index}`}
            state={t.state}
            plan={t.phase === 'plan' ? t.draft : null}
            setPlan={t.setDraft}
            phase={t.phase === 'plan' ? 'plan' : t.phase === 'replay' ? 'replay' : 'results'}
            report={t.run?.report ?? null}
            onRun={t.runNow}
            onReplayDone={t.finishReplay}
            reduced={reduced}
            replaySpeed={game.settings.replaySpeed}
            steps={t.lesson.steps}
            focus={t.phase === 'plan' ? t.lesson.focus(t.start, t.draft) : undefined}
            primary={lessonPrimary(t, fullSaturday)}
            panel={(ctx) => <LessonPanel t={t} ctx={ctx} onFullSaturday={fullSaturday} />}
          />
        </>
      ) : (
        <>
          <StatusBar
            state={game.phase === 'setup' ? null : game.phase === 'replay' ? (game.previousState ?? game.state) : game.state}
            saveOk={game.saveOk}
            onHelp={() => setDialog('help')}
            onSettings={() => setDialog('settings')}
            onMenu={() => setDialog('menu')}
          />
          {game.phase === 'setup' && <Setup key={game.record.seed} seed={game.record.seed} onConfirm={game.confirmSetup} onLearn={learn} returning={returning} />}
          {game.phase === 'closed' && game.state && <Closing state={game.state} onRetry={game.retrySameSaturday} onNew={game.newSaturday} />}
          {(game.phase === 'plan' || game.phase === 'replay' || game.phase === 'results') && game.state && (
            <ShopScreen
              state={game.state}
              plan={game.phase === 'plan' ? game.draft : null}
              setPlan={game.setDraft}
              phase={game.phase}
              report={game.lastReport}
              onRun={game.runNextHour}
              onReplayDone={game.finishReplay}
              reduced={reduced}
              replaySpeed={game.settings.replaySpeed}
              steps={6}
              summaryOnPlan
              primary={gamePrimary()}
              tools={(ctx) => (
                <GameTools state={game.state!} plan={game.draft} ctx={ctx} current={game.phase === 'replay' ? (game.lastReport?.hour ?? game.state!.hour) : game.state!.hour} planning={game.phase === 'plan'} />
              )}
              panel={(ctx) =>
                game.phase === 'plan' && game.draft ? (
                  ctx.summary && !ctx.sel ? (
                    <SummaryCard report={ctx.summary} onDismiss={ctx.dismissSummary} />
                  ) : (
                    <GamePanel state={game.state!} plan={game.draft} onChange={ctx.onPlanChange} sel={ctx.sel} setSel={ctx.setSel} />
                  )
                ) : game.phase === 'replay' && game.lastReport ? (
                  <ReplayPanel report={game.lastReport} step={ctx.step} />
                ) : game.lastReport ? (
                  <SummaryCard report={game.lastReport} />
                ) : null
              }
            />
          )}
        </>
      )}
      {dialog === 'help' && <Help onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={game.settings} onChange={game.setSettings} onClose={() => setDialog(null)} />}
      {dialog === 'menu' && (
        <Menu
          seed={game.record.seed}
          onClose={() => setDialog(null)}
          onLearn={learn}
          onRetry={() => {
            exitTutorial();
            game.retrySameSaturday();
            setDialog(null);
          }}
          onNew={() => {
            exitTutorial();
            game.newSaturday();
            setDialog(null);
          }}
          onCurated={() => {
            exitTutorial();
            game.playCurated();
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
