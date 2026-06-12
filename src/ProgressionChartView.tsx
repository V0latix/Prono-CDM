import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

// Vue isolée du graphe de progression (Classement). Séparée d'App.tsx pour que
// recharts soit chargé à la demande (code-splitting) et non dans le bundle initial.

const PROGRESSION_COLORS = {
  me: "#22c55e",
  leader: "#f59e0b",
  average: "#94a3b8"
};

export type ProgressionChartDatum = {
  index: number;
  label: string;
  me: number;
  leader: number;
  average: number;
};

export default function ProgressionChartView({
  data,
  showLeader,
  leaderPseudo
}: {
  data: ProgressionChartDatum[];
  showLeader: boolean;
  leaderPseudo: string | null;
}) {
  return (
    <div className="progression-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
          <XAxis
            dataKey="index"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(148, 163, 184, 0.4)" }}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(148, 163, 184, 0.4)" }}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            labelFormatter={(value) => data[Number(value) - 1]?.label ?? ""}
            formatter={(value) => `${value} pts`}
            contentStyle={{
              background: "rgba(15, 23, 42, 0.92)",
              border: "none",
              borderRadius: 8,
              color: "#f8fafc",
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="me"
            name="Moi"
            stroke={PROGRESSION_COLORS.me}
            strokeWidth={2}
            dot={false}
          />
          {showLeader && (
            <Line
              type="monotone"
              dataKey="leader"
              name={`Leader · ${leaderPseudo}`}
              stroke={PROGRESSION_COLORS.leader}
              strokeWidth={2}
              dot={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="average"
            name="Moyenne ligue"
            stroke={PROGRESSION_COLORS.average}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
