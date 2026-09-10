import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill, Score } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { aiGenerateIdeas } from "@/lib/actions/content";
import { listInsights, listPersonas, listResearch } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Nghiên cứu & insight – BAOR AI OS" };

export default function ResearchPage() {
  const research = listResearch();
  const insights = listInsights();
  const personas = listPersonas();

  return (
    <>
      <PageHead
        title="Nghiên cứu & insight"
        sub="AI đọc bình luận, inbox và số liệu kênh, gom thành insight để đề xuất nội dung. Kết nối Facebook để AI tự cập nhật."
        action={
          <form action={aiGenerateIdeas}>
            <Button variant="primary" size="md" type="submit">Sinh ý tưởng từ insight</Button>
          </form>
        }
      />

      <Panel className="mt-0">
        <PanelHeader title="Kênh phù hợp" sub={`Cập nhật ${research[0] ? formatDateTime(research[0].updatedAt) : "—"} · chấm theo mức khớp với khách hàng mục tiêu.`} />
        <Table>
          <thead>
            <tr>
              <Th>Kênh</Th>
              <Th>Đang lên</Th>
              <Th>Giờ vàng</Th>
              <Th right>Phù hợp</Th>
            </tr>
          </thead>
          <tbody>
            {research.map((r) => (
              <tr key={r.id}>
                <Td className="font-semibold text-ink">{r.name}</Td>
                <Td>{r.trendingTopics.slice(0, 3).join(" · ")}</Td>
                <Td className="num">{r.bestPostingTimes.join(" · ")}</Td>
                <Td right>
                  <Pill tone={r.audienceFit >= 80 ? "jade" : r.audienceFit >= 70 ? "amber" : "neutral"} className="num">{r.audienceFit}%</Pill>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader title="Chân dung khách hàng" sub="Tỷ lệ trong tập khách và nỗi đau chính." />
        <Rows>
          {personas.map((p) => (
            <Row
              key={p.id}
              lead={<Pill tone="jade" className="num">{p.share}%</Pill>}
              title={p.name}
              sub={`${p.ageRange} tuổi · ${p.occupation} · ${p.location}`}
              extra={<div className="mt-1 text-[12px] text-ink-2">Nỗi đau: {p.painPoints.join(" · ")}</div>}
            />
          ))}
        </Rows>
      </Panel>

      <Panel>
        <PanelHeader title="Insight đang dùng" sub="Xếp theo độ tin cậy. Bấm nút phía trên để AI bung thành ý tưởng nội dung." />
        <Rows>
          {insights.map((i, idx) => {
            const persona = personas.find((p) => p.id === i.personaId);
            return (
              <Row
                key={i.id}
                lead={
                  <span className="flex items-center gap-3">
                    <span className="w-3 text-[12px] font-semibold text-ink-3">{idx + 1}</span>
                    <Score value={i.confidence} />
                  </span>
                }
                title={i.title}
                sub={i.detail}
                extra={
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {persona && <Pill>{persona.name.split(" – ")[1] ?? persona.name}</Pill>}
                    <Pill>{i.source}</Pill>
                  </div>
                }
              />
            );
          })}
        </Rows>
      </Panel>
    </>
  );
}
