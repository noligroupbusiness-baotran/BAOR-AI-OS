import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill, Score } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { platformResearch } from "@/lib/data/research";
import { insights, personas } from "@/lib/data/insights";

export const metadata = { title: "Nghiên cứu & insight – BAOR AI OS" };

export default function ResearchPage() {
  return (
    <>
      <PageHead
        title="Nghiên cứu & insight"
        sub="AI đọc bình luận, inbox và số liệu kênh mỗi ngày, gom thành insight để đề xuất nội dung."
        action={<Button variant="primary" size="md">Cập nhật insight</Button>}
      />

      <Panel className="mt-0">
        <PanelHeader title="Kênh phù hợp" sub="Chấm theo mức khớp với khách hàng mục tiêu." />
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
            {platformResearch
              .slice()
              .sort((a, b) => b.audienceFit - a.audienceFit)
              .map((r) => (
                <tr key={r.id}>
                  <Td className="font-semibold text-ink">{r.name}</Td>
                  <Td>{r.trendingTopics.slice(0, 3).join(" · ")}</Td>
                  <Td className="num">{r.bestPostingTimes.join(" · ")}</Td>
                  <Td right>
                    <Pill tone={r.audienceFit >= 80 ? "jade" : r.audienceFit >= 70 ? "amber" : "neutral"} className="num">
                      {r.audienceFit}%
                    </Pill>
                  </Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader title="Insight đang dùng" sub="Xếp theo độ tin cậy. Mỗi insight có thể bung thành nhiều chủ đề." />
        <Rows>
          {insights
            .slice()
            .sort((a, b) => b.confidence - a.confidence)
            .map((i, idx) => {
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
                      <Pill>{persona?.name.split(" – ")[1] ?? persona?.name}</Pill>
                      <Pill>{i.source}</Pill>
                    </div>
                  }
                  action={<Button variant="soft">Bung chủ đề</Button>}
                />
              );
            })}
        </Rows>
      </Panel>
    </>
  );
}
