import { BrainCircuit, CheckCircle2 } from "lucide-react";

export function AiNicheAnalysis() {
  return (
    <section className="relative col-span-1 overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] md:col-span-2 sm:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 -translate-y-1/2 translate-x-1/2 rounded-full bg-[var(--color-primary-light)] opacity-80 blur-3xl" />

      <div className="relative mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <BrainCircuit aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-[0.08em]">
              AI 生态位分析
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-[30px] text-[var(--color-text)]">
            AIGC 架构师 / 模型部署专家
          </h2>
        </div>
        <span className="w-fit rounded-full bg-[#eaf0e8] px-3 py-1 text-xs font-bold leading-4 text-[var(--color-green)]">
          行业前 5% 稀缺度
        </span>
      </div>

      <div className="relative grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr] md:items-center">
        <div className="relative mx-auto flex size-48 items-center justify-center rounded-full border-4 border-[rgba(196,135,58,0.25)]">
          <div className="absolute inset-4 rounded-full border-2 border-[var(--color-primary)]" />
          <div className="absolute inset-9 rounded-full bg-[var(--color-primary-light)]" />
          <div className="relative text-center">
            <p className="text-[42px] font-bold leading-none text-[var(--color-primary)]">
              88
            </p>
            <p className="mt-2 text-xs font-medium leading-4 text-[var(--color-text-secondary)]">
              核心匹配度
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4">
            <p className="mb-1 text-sm font-bold leading-5 text-[var(--color-primary)]">
              当前定位：LLM 优化与推理部署交叉型人才
            </p>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              简历中的 LLM 优化、分布式训练和 TensorRT 经验具备清晰聚焦，适合面向平台架构、推理服务和 AIGC 中台岗位投递。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NicheStat label="主要优势" value="PyTorch / TensorRT" />
            <NicheStat label="行业吸引力" value="极高 S 级" highlighted />
          </div>

          <div className="flex items-start gap-2 rounded-[14px] bg-[var(--color-primary-light)] p-3 text-xs leading-5 text-[#6b4716]">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.8}
            />
            建议把“模型优化”拆成训练、压缩、推理部署三段经历，提升架构岗位的可读性。
          </div>
        </div>
      </div>
    </section>
  );
}

type NicheStatProps = {
  label: string;
  value: string;
  highlighted?: boolean;
};

function NicheStat({ label, value, highlighted = false }: NicheStatProps) {
  return (
    <div className="rounded-[16px] border border-[var(--color-border)] bg-white p-4">
      <p className="text-xs leading-4 text-[var(--color-text-secondary)]">{label}</p>
      <p
        className={`mt-1 text-sm font-bold leading-5 ${
          highlighted ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
