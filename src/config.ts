export interface LotteryConfig {
  title: string;
  totalSpaces: number;
  bigSpaceNumbers: number[]; // 特定的大車位編號
  candidates: string[];
  secondCandidates: string[];
  themeColor: string;
}

export const config: LotteryConfig = {
  title: "社區車位抽選系統",
  totalSpaces: 12,
  bigSpaceNumbers: [1, 2, 3, 4], // 預設 1, 2, 3, 4 是大車位
  candidates: [
    "70-2F", "70-3F", "70-4F", "72-5F", "72-6F", 
    "74-8F", "74-9F", "76-10F", "76-11F", "78-12F"
  ],
  secondCandidates: [
    "70-2F", "72-5F", "74-8F", "80-2F", "80-5F", "82-7F"
  ],
  themeColor: "#2c3e50"
};
