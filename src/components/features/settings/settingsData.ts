import {
  Bell,
  FileText,
  Gauge,
  History,
  Languages,
  LockKeyhole,
  Mail,
  Palette,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export const profileDefaults = {
  name: "陈默",
  role: "高级 AI 产品经理",
  city: "上海，中国",
  bio: "专注 AI 驱动的效率工具开发，深耕互联网行业 8 年。目前主要研究大模型应用层在职场场景的落地。",
};

export const skills = ["大语言模型 (LLM)", "产品架构", "用户增长"];

export const targetIndustries = "人工智能、企业服务、FinTech";

export const securityItems = [
  {
    label: "登录密码",
    value: "已设置",
    icon: LockKeyhole,
    action: "查看登录密码设置",
  },
  {
    label: "手机绑定",
    value: "138 **** 9021",
    icon: Phone,
    action: "查看手机绑定设置",
  },
  {
    label: "电子邮箱",
    value: "chen**@example.com",
    icon: Mail,
    action: "编辑电子邮箱",
    editable: true,
  },
];

export const preferenceGroups = [
  {
    label: "主题模式",
    icon: Palette,
    options: ["浅色", "深色", "自动"],
  },
];

export const languageOptions = ["简体中文", "English", "日本語"];

export const profileStats = [
  { label: "最近评估", value: "12", icon: FileText },
  { label: "风险拦截", value: "3", icon: ShieldCheck },
  { label: "关注趋势", value: "8", icon: Gauge },
  { label: "历史报告", value: "21", icon: History },
];

export const notificationSettings = [
  {
    label: "岗位风险提醒",
    detail: "发现高风险 JD 时推送通知",
    icon: Bell,
    enabled: true,
  },
  {
    label: "报告生成提醒",
    detail: "评估完成后发送站内消息",
    icon: FileText,
    enabled: true,
  },
  {
    label: "语言偏好同步",
    detail: "同步到报告与简历模板",
    icon: Languages,
    enabled: false,
  },
];

export const avatarInitials = "陈";
export const avatarTone = "linear-gradient(135deg, #c4873a 0%, #8b6f4d 48%, #5b7f9e 100%)";
export const accountName = "陈默";
export const accountTitle = "Account";
export const profileIcon = UserRound;
