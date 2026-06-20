import { AppShell } from "../../components/AppShell";
import { ComingSoon } from "../../components/pages/ComingSoon";
export default function Page() {
  return (
    <AppShell active="insights">
      <ComingSoon title="Insights" note="Where the spending lenses meet your real data. Try them now under Philosophies." />
    </AppShell>
  );
}
