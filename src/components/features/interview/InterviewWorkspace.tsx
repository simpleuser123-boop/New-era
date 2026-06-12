"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquarePlus,
  PenLine,
  RefreshCw,
  Save,
  Sparkles,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Textarea } from "@/components/ui/Textarea";
import { apiRequest, readErrorMessage } from "@/lib/api-client";
import type {
  InterviewAnswerDto,
  InterviewMode,
  InterviewQuestion,
  InterviewQuestionType,
  InterviewSessionDto,
  ReportDto,
  ResumeDto,
  StoryDto,
} from "@/lib/types";

type InterviewWorkspaceProps = {
  initialReportId?: number;
};

type LoadStatus = "loading" | "ready" | "error";
type ActionStatus = "idle" | "submitting";
type Feedback = {
  message: string;
  tone: "error" | "success" | "warning";
};

type SessionsResponse = {
  ok: true;
  count: number;
  limit: number;
  sessions: InterviewSessionDto[];
};

type SessionDetailResponse = {
  ok: true;
  answers: InterviewAnswerDto[];
  session: InterviewSessionDto;
};

type SessionCreateResponse = {
  ok: true;
  session: InterviewSessionDto;
};

type QuestionsResponse = {
  ok: true;
  fallbackCode: string | null;
  fallbackMessage: string | null;
  fallbackUsed: boolean;
  provider: "deepseek_enhanced" | "local_fallback";
  session: InterviewSessionDto;
};

type AnswerCreateResponse = {
  ok: true;
  answer: InterviewAnswerDto;
  answers: InterviewAnswerDto[];
  fallbackCode: string | null;
  fallbackMessage: string | null;
  fallbackUsed: boolean;
  provider: "deepseek_enhanced" | "local_fallback";
};

type ReportsResponse = {
  ok: true;
  reports: ReportDto[];
  count: number;
  limit: number;
};

type ResumesResponse = {
  ok: true;
  resumes: ResumeDto[];
  count: number;
  limit: number;
};

type StoriesResponse = {
  ok: true;
  stories: StoryDto[];
  count: number;
  limit: number;
};

type StoryCreateResponse = {
  ok: true;
  story: StoryDto;
};

type SessionDraft = {
  mode: InterviewMode;
  reportId: string;
  resumeId: string;
  title: string;
};

type StoryDraft = {
  action: string;
  result: string;
  situation: string;
  tagsText: string;
  task: string;
  title: string;
};

const MODE_OPTIONS: Array<{ label: string; value: InterviewMode }> = [
  { label: "综合", value: "mixed" },
  { label: "技术", value: "technical" },
  { label: "产品", value: "product" },
  { label: "行为", value: "behavioral" },
  { label: "项目深挖", value: "project" },
];

const QUESTION_TYPE_LABELS: Record<InterviewQuestionType, string> = {
  behavioral: "行为",
  motivation: "动机",
  product: "产品",
  project: "项目",
  risk: "风险",
  technical: "技术",
};

const QUESTION_TYPE_STYLES: Record<InterviewQuestionType, string> = {
  behavioral: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
  motivation: "border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
  product: "border-[#cfe2f7] bg-[#f1f7ff] text-[#2f6aa3]",
  project: "border-[#dfd8ec] bg-[#f4f0fb] text-[#725f91]",
  risk: "border-[#efd4d0] bg-[#fff0ee] text-[#b45c52]",
  technical: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
};

const DEFAULT_STORY_DRAFT: StoryDraft = {
  action: "",
  result: "",
  situation: "",
  tagsText: "",
  task: "",
  title: "",
};

export function InterviewWorkspace({ initialReportId }: InterviewWorkspaceProps) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string>();
  const [reports, setReports] = useState<ReportDto[]>([]);
  const [resumes, setResumes] = useState<ResumeDto[]>([]);
  const [sessions, setSessions] = useState<InterviewSessionDto[]>([]);
  const [stories, setStories] = useState<StoryDto[]>([]);
  const [selectedSession, setSelectedSession] =
    useState<InterviewSessionDto | null>(null);
  const [answers, setAnswers] = useState<InterviewAnswerDto[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string>("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>({
    mode: "mixed",
    reportId: initialReportId ? String(initialReportId) : "",
    resumeId: "default",
    title: "",
  });
  const [storyDraft, setStoryDraft] =
    useState<StoryDraft>(DEFAULT_STORY_DRAFT);
  const [createStatus, setCreateStatus] = useState<ActionStatus>("idle");
  const [questionStatus, setQuestionStatus] = useState<ActionStatus>("idle");
  const [answerStatus, setAnswerStatus] = useState<ActionStatus>("idle");
  const [storyStatus, setStoryStatus] = useState<ActionStatus>("idle");
  const [feedback, setFeedback] = useState<Feedback>();

  const selectedReport = useMemo(
    () =>
      reports.find((report) => report.id === Number(sessionDraft.reportId)) ??
      null,
    [reports, sessionDraft.reportId],
  );
  const selectedResume = useMemo(
    () =>
      sessionDraft.resumeId === "default"
        ? resumes.find((resume) => resume.isDefault) ?? null
        : resumes.find((resume) => resume.id === Number(sessionDraft.resumeId)) ??
          null,
    [resumes, sessionDraft.resumeId],
  );
  const activeQuestion = useMemo(
    () =>
      selectedSession?.questions.find(
        (question) => question.id === activeQuestionId,
      ) ?? selectedSession?.questions[0] ?? null,
    [activeQuestionId, selectedSession],
  );
  const latestAnswerForQuestion = useMemo(
    () =>
      activeQuestion
        ? answers.find((answer) => answer.questionId === activeQuestion.id) ?? null
        : null,
    [activeQuestion, answers],
  );

  const syncSessionDraftFromSession = useCallback((session: InterviewSessionDto) => {
    setSessionDraft((current) => ({
      ...current,
      mode: session.mode,
      reportId: session.reportId ? String(session.reportId) : current.reportId,
      resumeId: session.resumeId ? String(session.resumeId) : "default",
      title: "",
    }));
  }, []);

  const loadSession = useCallback(
    async (sessionId: number, signal?: AbortSignal) => {
      const body = await apiRequest<SessionDetailResponse>(
        `/api/interview/sessions/${sessionId}`,
        {
          cache: "no-store",
          errorMessage: "面试会话读取失败，请稍后重试。",
          signal,
        },
      );

      if (signal?.aborted) {
        return;
      }

      setSelectedSession(body.session);
      setAnswers(body.answers);
      setActiveQuestionId(body.session.questions[0]?.id ?? "");
      setAnswerDraft("");
      syncSessionDraftFromSession(body.session);
    },
    [syncSessionDraftFromSession],
  );

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    setLoadStatus("loading");
    setLoadError(undefined);

    try {
      const [reportsBody, resumesBody, sessionsBody, storiesBody] =
        await Promise.all([
          apiRequest<ReportsResponse>("/api/reports?limit=100", {
            cache: "no-store",
            errorMessage: "面试上下文读取失败，请稍后重试。",
            signal,
          }),
          apiRequest<ResumesResponse>("/api/resumes?limit=100", {
            cache: "no-store",
            errorMessage: "面试上下文读取失败，请稍后重试。",
            signal,
          }),
          apiRequest<SessionsResponse>("/api/interview/sessions?limit=100", {
            cache: "no-store",
            errorMessage: "面试会话读取失败，请稍后重试。",
            signal,
          }),
          apiRequest<StoriesResponse>("/api/stories?limit=100", {
            cache: "no-store",
            errorMessage: "STAR 故事库读取失败，请稍后重试。",
            signal,
          }),
        ]);

      if (signal?.aborted) {
        return;
      }

      setReports(reportsBody.reports);
      setResumes(resumesBody.resumes);
      setSessions(sessionsBody.sessions);
      setStories(storiesBody.stories);
      setLoadStatus("ready");

      setSessionDraft((current) =>
        current.reportId || !reportsBody.reports[0]
          ? current
          : {
              ...current,
              reportId: String(reportsBody.reports[0].id),
            },
      );

      const preferredSession =
        initialReportId !== undefined
          ? sessionsBody.sessions.find(
              (session) => session.reportId === initialReportId,
            )
          : undefined;
      const sessionToOpen = preferredSession ?? sessionsBody.sessions[0];

      if (sessionToOpen) {
        await loadSession(sessionToOpen.id, signal);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setLoadError(readErrorMessage(error, "面试工作台读取失败，请稍后重试。"));
      setLoadStatus("error");
    }
  }, [initialReportId, loadSession]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadWorkspace(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadWorkspace]);

  async function handleCreateSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sessionDraft.reportId || createStatus === "submitting") {
      setFeedback({
        message: "请先选择一份已保存的评估报告。",
        tone: "error",
      });
      return;
    }

    setCreateStatus("submitting");
    setFeedback(undefined);

    try {
      const body = await apiRequest<SessionCreateResponse>(
        "/api/interview/sessions",
        {
          errorMessage: "面试会话创建失败，请稍后重试。",
          json: {
            mode: sessionDraft.mode,
            reportId: Number(sessionDraft.reportId),
            ...(sessionDraft.resumeId !== "default"
              ? { resumeId: Number(sessionDraft.resumeId) }
              : {}),
            ...(sessionDraft.title.trim()
              ? { title: sessionDraft.title.trim() }
              : {}),
          },
          method: "POST",
        },
      );

      setSessions((current) => upsertSession(current, body.session));
      setSelectedSession(body.session);
      setAnswers([]);
      setActiveQuestionId("");
      setAnswerDraft("");
      syncSessionDraftFromSession(body.session);
      setFeedback({
        message: "面试准备会话已创建，请继续生成问题。",
        tone: "success",
      });
    } catch (error) {
      setFeedback({
        message: readErrorMessage(error, "面试会话创建失败，请稍后重试。"),
        tone: "error",
      });
    } finally {
      setCreateStatus("idle");
    }
  }

  async function handleGenerateQuestions() {
    if (!selectedSession || questionStatus === "submitting") {
      return;
    }

    setQuestionStatus("submitting");
    setFeedback(undefined);

    try {
      const body = await apiRequest<QuestionsResponse>(
        `/api/interview/sessions/${selectedSession.id}/questions`,
        {
          errorMessage: "面试问题生成失败，请稍后重试。",
          method: "POST",
          timeoutMs: 30_000,
        },
      );

      setSessions((current) => upsertSession(current, body.session));
      setSelectedSession(body.session);
      setActiveQuestionId(body.session.questions[0]?.id ?? "");
      setAnswerDraft("");
      setFeedback({
        message: body.fallbackUsed
          ? "面试问题已生成，可继续使用。"
          : "面试问题已生成并保存。",
        tone: body.fallbackUsed ? "warning" : "success",
      });
    } catch (error) {
      setFeedback({
        message: readErrorMessage(error, "面试问题生成失败，请稍后重试。"),
        tone: "error",
      });
    } finally {
      setQuestionStatus("idle");
    }
  }

  async function handleSaveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSession || !activeQuestion || answerStatus === "submitting") {
      return;
    }

    setAnswerStatus("submitting");
    setFeedback(undefined);

    try {
      const body = await apiRequest<AnswerCreateResponse>(
        `/api/interview/sessions/${selectedSession.id}/answers`,
        {
          errorMessage: "回答保存或评分失败，请稍后重试。",
          json: {
            answerText: answerDraft,
            questionId: activeQuestion.id,
          },
          method: "POST",
          timeoutMs: 30_000,
        },
      );

      setAnswers(body.answers);
      setAnswerDraft("");
      setFeedback({
        message: body.fallbackUsed
          ? "回答已保存，评分反馈已更新。"
          : "回答已保存，评分反馈已更新。",
        tone: body.fallbackUsed ? "warning" : "success",
      });
    } catch (error) {
      setFeedback({
        message: readErrorMessage(error, "回答保存或评分失败，请稍后重试。"),
        tone: "error",
      });
    } finally {
      setAnswerStatus("idle");
    }
  }

  async function handleSaveStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (storyStatus === "submitting") {
      return;
    }

    setStoryStatus("submitting");
    setFeedback(undefined);

    try {
      const body = await apiRequest<StoryCreateResponse>("/api/stories", {
        errorMessage: "STAR 故事保存失败，请稍后重试。",
        json: {
          action: storyDraft.action,
          result: storyDraft.result,
          situation: storyDraft.situation,
          tags: splitTags(storyDraft.tagsText),
          task: storyDraft.task,
          title: storyDraft.title,
        },
        method: "POST",
      });

      setStories((current) => [body.story, ...current]);
      setStoryDraft(DEFAULT_STORY_DRAFT);
      setFeedback({
        message: "STAR 故事已保存。",
        tone: "success",
      });
    } catch (error) {
      setFeedback({
        message: readErrorMessage(error, "STAR 故事保存失败，请稍后重试。"),
        tone: "error",
      });
    } finally {
      setStoryStatus("idle");
    }
  }

  if (loadStatus === "loading") {
    return <InterviewSkeleton />;
  }

  if (loadStatus === "error") {
    return (
      <ErrorState
        action={
          <Button
            leftIcon={<RefreshCw aria-hidden="true" className="size-4" />}
            onClick={() => void loadWorkspace()}
            variant="outline"
          >
            重新读取
          </Button>
        }
        description={loadError}
        title="面试工作台加载失败"
      />
    );
  }

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
      <aside className="space-y-5">
        <Panel
          icon={<MessageSquarePlus aria-hidden="true" className="size-5" />}
          title="新建准备"
        >
          <form className="space-y-4" onSubmit={handleCreateSession}>
            <FieldLabel label="评估报告">
              <select
                className={selectClassName}
                onChange={(event) =>
                  setSessionDraft((current) => ({
                    ...current,
                    reportId: event.target.value,
                  }))
                }
                value={sessionDraft.reportId}
              >
                <option value="">选择报告</option>
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.company} · {report.role}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="简历">
              <select
                className={selectClassName}
                onChange={(event) =>
                  setSessionDraft((current) => ({
                    ...current,
                    resumeId: event.target.value,
                  }))
                }
                value={sessionDraft.resumeId}
              >
                <option value="default">使用默认简历</option>
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.name}
                    {resume.isDefault ? "（默认）" : ""}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="面试模式">
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((mode) => (
                  <button
                    className={`h-10 rounded-[12px] border px-3 text-sm font-bold transition-all ${
                      sessionDraft.mode === mode.value
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                        : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
                    }`}
                    key={mode.value}
                    onClick={() =>
                      setSessionDraft((current) => ({
                        ...current,
                        mode: mode.value,
                      }))
                    }
                    type="button"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </FieldLabel>
            <FieldLabel label="会话标题">
              <input
                className={inputClassName}
                onChange={(event) =>
                  setSessionDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="可选"
                value={sessionDraft.title}
              />
            </FieldLabel>
            <Button
              className="w-full"
              disabled={!sessionDraft.reportId || createStatus === "submitting"}
              leftIcon={
                createStatus === "submitting" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )
              }
              type="submit"
            >
              {createStatus === "submitting" ? "创建中" : "创建会话"}
            </Button>
          </form>
        </Panel>

        <Panel
          icon={<BookOpenCheck aria-hidden="true" className="size-5" />}
          title="历史会话"
        >
          {sessions.length > 0 ? (
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  className={`w-full rounded-[14px] border px-3 py-3 text-left transition-all ${
                    selectedSession?.id === session.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                      : "border-[var(--color-border-light)] bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)]"
                  }`}
                  key={session.id}
                  onClick={() => void loadSession(session.id)}
                  type="button"
                >
                  <p className="truncate text-sm font-bold leading-5 text-[var(--color-text)]">
                    {session.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {formatMode(session.mode)} · {session.questions.length} 题 ·{" "}
                    {formatDate(session.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">
              暂无面试准备会话。选择报告后创建第一场练习。
            </p>
          )}
        </Panel>
      </aside>

      <main className="min-w-0 space-y-5">
        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <Panel
          action={
            selectedSession ? (
              <Button
                disabled={questionStatus === "submitting"}
                leftIcon={
                  questionStatus === "submitting" ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Sparkles aria-hidden="true" className="size-4" />
                  )
                }
                onClick={handleGenerateQuestions}
                size="sm"
              >
                {questionStatus === "submitting" ? "生成中" : "生成问题"}
              </Button>
            ) : null
          }
          icon={<FileText aria-hidden="true" className="size-5" />}
          title={selectedSession?.title ?? "面试问题"}
        >
          <ContextSummary
            report={selectedReport}
            resume={selectedResume}
            session={selectedSession}
          />

          {!selectedSession ? (
            <EmptyState
              className="mt-5"
              description="先从左侧选择报告创建会话，再生成 8-12 个面试问题。"
              icon={
                <MessageSquarePlus
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.8}
                />
              }
              title="还没有选中的面试会话"
            />
          ) : selectedSession.questions.length === 0 ? (
            <EmptyState
              className="mt-5"
              action={
                <Button
                  leftIcon={<Sparkles aria-hidden="true" className="size-4" />}
                  onClick={handleGenerateQuestions}
                >
                  生成问题
                </Button>
              }
              description="生成问题后，可以逐题作答并查看评分反馈。"
              icon={<Sparkles aria-hidden="true" className="size-6" />}
              title="尚未生成问题"
            />
          ) : (
            <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
              <section
                aria-label="生成的面试问题"
                className="min-w-0"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    生成的面试问题
                  </h3>
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
                    {selectedSession.questions.length} 题
                  </span>
                </div>
                <QuestionList
                  activeQuestionId={activeQuestion?.id ?? ""}
                  onSelect={setActiveQuestionId}
                  questions={selectedSession.questions}
                />
              </section>
              <section
                aria-label="回答"
                className="min-w-0 lg:border-l lg:border-[var(--color-border-light)] lg:pl-5"
              >
                <h3 className="mb-3 text-sm font-bold leading-5 text-[var(--color-text)]">
                  回答
                </h3>
                <AnswerPanel
                  answerDraft={answerDraft}
                  isSaving={answerStatus === "submitting"}
                  latestAnswer={latestAnswerForQuestion}
                  onAnswerChange={setAnswerDraft}
                  onSubmit={handleSaveAnswer}
                  question={activeQuestion}
                />
              </section>
            </div>
          )}
        </Panel>
      </main>

      <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <Panel
          icon={<Star aria-hidden="true" className="size-5" />}
          title="STAR 故事库"
        >
          <form className="space-y-3" onSubmit={handleSaveStory}>
            <FieldLabel label="标题">
              <input
                className={inputClassName}
                onChange={(event) =>
                  setStoryDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="例如：从 0 到 1 落地 RAG 评测"
                value={storyDraft.title}
              />
            </FieldLabel>
            <Textarea
              className="min-h-20 text-sm leading-6"
              label="S 情境"
              onChange={(event) =>
                setStoryDraft((current) => ({
                  ...current,
                  situation: event.target.value,
                }))
              }
              value={storyDraft.situation}
            />
            <Textarea
              className="min-h-20 text-sm leading-6"
              label="T 任务"
              onChange={(event) =>
                setStoryDraft((current) => ({
                  ...current,
                  task: event.target.value,
                }))
              }
              value={storyDraft.task}
            />
            <Textarea
              className="min-h-24 text-sm leading-6"
              label="A 行动"
              onChange={(event) =>
                setStoryDraft((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              value={storyDraft.action}
            />
            <Textarea
              className="min-h-20 text-sm leading-6"
              label="R 结果"
              onChange={(event) =>
                setStoryDraft((current) => ({
                  ...current,
                  result: event.target.value,
                }))
              }
              value={storyDraft.result}
            />
            <FieldLabel label="标签">
              <input
                className={inputClassName}
                onChange={(event) =>
                  setStoryDraft((current) => ({
                    ...current,
                    tagsText: event.target.value,
                  }))
                }
                placeholder="RAG、跨团队、指标"
                value={storyDraft.tagsText}
              />
            </FieldLabel>
            <Button
              className="w-full"
              disabled={!storyDraft.title.trim() || storyStatus === "submitting"}
              leftIcon={
                storyStatus === "submitting" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )
              }
              type="submit"
            >
              {storyStatus === "submitting" ? "保存中" : "保存故事"}
            </Button>
          </form>
        </Panel>

        <Panel
          icon={<BookOpenCheck aria-hidden="true" className="size-5" />}
          title="已保存故事"
        >
          {stories.length > 0 ? (
            <div className="space-y-3">
              {stories.map((story) => (
                <article
                  className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4"
                  key={story.id}
                >
                  <h3 className="text-sm font-bold leading-5 text-[var(--color-text)]">
                    {story.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {story.result || story.action || story.situation || "已保存"}
                  </p>
                  {story.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {story.tags.slice(0, 5).map((tag) => (
                        <span
                          className="rounded-full border border-[var(--color-border)] bg-white px-2 py-1 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-hover)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">
              暂无 STAR 故事。保存后会显示在这里，面试回答时可复用。
            </p>
          )}
        </Panel>
      </aside>
    </section>
  );
}

function ContextSummary({
  report,
  resume,
  session,
}: {
  report: ReportDto | null;
  resume: ResumeDto | null;
  session: InterviewSessionDto | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <SummaryCell
        label="报告"
        value={report ? `${report.company} · ${report.role}` : "未选择"}
      />
      <SummaryCell
        label="简历"
        value={resume ? resume.name : "默认简历或本地兜底"}
      />
      <SummaryCell
        label="模式"
        value={session ? formatMode(session.mode) : "未创建"}
      />
    </div>
  );
}

function QuestionList({
  activeQuestionId,
  onSelect,
  questions,
}: {
  activeQuestionId: string;
  onSelect: (questionId: string) => void;
  questions: InterviewQuestion[];
}) {
  return (
    <div
      className="interview-question-scroll max-h-[430px] space-y-3 overflow-y-auto overscroll-contain pr-1 lg:max-h-[calc(100dvh-380px)]"
    >
      {questions.map((question, index) => (
        <button
          className={`w-full rounded-[16px] border p-4 text-left transition-all ${
            activeQuestionId === question.id
              ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
              : "border-[var(--color-border-light)] bg-white hover:border-[var(--color-primary)]"
          }`}
          key={question.id}
          onClick={() => onSelect(question.id)}
          type="button"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold leading-4 text-[var(--color-muted)]">
              Q{index + 1}
            </span>
            <QuestionTypeBadge type={question.type} />
          </div>
          <p className="text-sm font-bold leading-6 text-[var(--color-text)]">
            {question.question}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            关注：{question.focus}
          </p>
        </button>
      ))}
    </div>
  );
}

function AnswerPanel({
  answerDraft,
  isSaving,
  latestAnswer,
  onAnswerChange,
  onSubmit,
  question,
}: {
  answerDraft: string;
  isSaving: boolean;
  latestAnswer: InterviewAnswerDto | null;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  question: InterviewQuestion | null;
}) {
  if (!question) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <QuestionTypeBadge type={question.type} />
          <span className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-bold leading-4 text-[var(--color-text-secondary)]">
            {question.focus}
          </span>
        </div>
        <h2 className="text-base font-bold leading-7 text-[var(--color-text)]">
          {question.question}
        </h2>
        {question.expectedSignals.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {question.expectedSignals.map((signal) => (
              <li
                className="flex gap-2 text-xs leading-5 text-[var(--color-text-secondary)]"
                key={signal}
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-[var(--color-green)]"
                />
                {signal}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <form className="min-w-0 space-y-3" onSubmit={onSubmit}>
        <Textarea
          className="min-h-52 text-sm leading-6"
          label="回答"
          onChange={(event) => onAnswerChange(event.target.value)}
          placeholder="建议按 STAR 或方案拆解结构写下完整回答，再保存评分。"
          value={answerDraft}
        />
        <Button
          disabled={answerDraft.trim().length < 10 || isSaving}
          leftIcon={
            isSaving ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <PenLine aria-hidden="true" className="size-4" />
            )
          }
          type="submit"
        >
          {isSaving ? "评分中" : "保存回答并评分"}
        </Button>
      </form>

      {latestAnswer ? <ScoreCard answer={latestAnswer} /> : null}
    </div>
  );
}

function ScoreCard({ answer }: { answer: InterviewAnswerDto }) {
  const score = answer.score;

  return (
    <section className="rounded-[18px] border border-[#cfe2f7] bg-[#f1f7ff] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold leading-4 text-[#2f6aa3]">
            最近一次评分
          </p>
          <h3 className="mt-1 text-[28px] font-semibold leading-9 text-[var(--color-text)]">
            {score.overall.toFixed(1)} / 5
          </h3>
        </div>
        <span className="w-fit rounded-full border border-[#cfe2f7] bg-white px-3 py-1 text-xs font-bold leading-5 text-[#2f6aa3]">
          评分反馈
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
        {score.summary}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ScoreMetric label="结构" value={score.structure} />
        <ScoreMetric label="证据" value={score.evidence} />
        <ScoreMetric label="JD" value={score.jdRelevance} />
        <ScoreMetric label="技术" value={score.aiAccuracy} />
        <ScoreMetric label="风险" value={score.riskHandling} />
      </div>
      {score.suggestions.length > 0 ? (
        <div className="mt-4 rounded-[14px] border border-[#cfe2f7] bg-white p-3">
          <p className="mb-2 text-xs font-bold leading-4 text-[var(--color-text)]">
            优化建议
          </p>
          <ul className="space-y-1.5">
            {score.suggestions.map((suggestion) => (
              <li
                className="text-xs leading-5 text-[var(--color-text-secondary)]"
                key={suggestion}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  const toneClass = {
    error: "border-[#efd4d0] bg-[#fff0ee] text-[var(--color-red)]",
    success: "border-[#d7e7d2] bg-[#eef6eb] text-[#5f7f50]",
    warning: "border-[#eedaa6] bg-[#fff7df] text-[#875006]",
  }[feedback.tone];
  const Icon = feedback.tone === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`flex items-start gap-2 rounded-[16px] border px-4 py-3 ${toneClass}`} role="status">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-bold leading-5">{feedback.message}</p>
    </div>
  );
}

function Panel({
  action,
  children,
  icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            {icon}
          </div>
          <h2 className="truncate text-base font-bold leading-6 text-[var(--color-text)]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-bold leading-5 text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--color-border-light)] bg-[var(--color-surface-hover)] px-4 py-3">
      <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold leading-5 text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function QuestionTypeBadge({ type }: { type: InterviewQuestionType }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${QUESTION_TYPE_STYLES[type]}`}>
      {QUESTION_TYPE_LABELS[type]}
    </span>
  );
}

function ScoreMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-[#cfe2f7] bg-white px-3 py-2 text-center">
      <p className="text-sm font-bold leading-5 text-[var(--color-text)]">
        {value.toFixed(1)}
      </p>
      <p className="text-[11px] leading-4 text-[var(--color-text-secondary)]">
        {label}
      </p>
    </div>
  );
}

function InterviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="h-[520px] animate-pulse rounded-[24px] bg-[var(--color-border-light)]"
          key={index}
        />
      ))}
    </div>
  );
}

function formatMode(mode: InterviewMode): string {
  return MODE_OPTIONS.find((item) => item.value === mode)?.label ?? "综合";
}

function formatDate(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function splitTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，、\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function upsertSession(
  current: InterviewSessionDto[],
  session: InterviewSessionDto,
): InterviewSessionDto[] {
  const withoutCurrent = current.filter((item) => item.id !== session.id);

  return [session, ...withoutCurrent];
}

const inputClassName =
  "h-11 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm leading-5 text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]";
const selectClassName =
  "h-11 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm leading-5 text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[rgba(196,135,58,0.2)]";
