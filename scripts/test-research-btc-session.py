import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('research', Path(__file__).with_name('research-btc-session-analysis.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def bar(t, o=100, h=101, lo=99, c=100, vol=100):
    return [t, o, h, lo, c, vol, vol * .6]


class CausalResearchTests(unittest.TestCase):
    def test_vietnam_hour_and_boundaries(self):
        self.assertEqual(m.session(m.stamp('2026-08-02T06:00:00')), '06-08')
        self.assertEqual(m.session(m.stamp('2026-08-02T08:00:00')), 'other')
        self.assertEqual(m.session(m.stamp('2026-08-02T01:59:00')), '20-02')
        self.assertEqual(m.session(m.stamp('2026-08-02T02:00:00')), 'other')

    def test_aggregation_drops_incomplete_and_gapped_bars(self):
        rows = [bar(i*m.STEP) for i in [0, 1, 2, 3, 5, 6]]
        agg = m.aggregate(rows, 3)
        self.assertEqual(len(agg), 1)
        self.assertEqual(agg[0][5], 300)

    def test_btc_features_prefix_invariant(self):
        rows = [bar(i*m.STEP, c=100+i*.05, h=103+i*.05) for i in range(80)]
        before = m.btc_features(rows[:50])
        after = m.btc_features(rows + [bar(80*m.STEP, o=200, h=300, lo=150, c=290)])
        self.assertTrue(before)
        self.assertEqual(before, {k: after[k] for k in before})

    def test_same_bar_both_hits_stop_first_long(self):
        rows = [bar(0, h=105, lo=97)]
        r = m.execute(rows, 0, 1, 98, 104, 1)
        self.assertEqual(r['reason'], 'SL_BOTH')
        self.assertLess(r['netPct'], -2)

    def test_same_bar_both_hits_stop_first_short(self):
        r = m.execute([bar(0, h=103, lo=95)], 0, -1, 102, 96, 1)
        self.assertEqual(r['reason'], 'SL_BOTH')
        self.assertLess(r['netPct'], -2)

    def test_stop_gap_not_filled_at_better_stop(self):
        rows = [bar(0), bar(m.STEP, o=95, h=96, lo=94, c=95)]
        r = m.execute(rows, 0, 1, 98, 104, 2)
        self.assertAlmostEqual(r['exit'], 95*(1-.0003))
        self.assertLess(r['netPct'], -5)

    def test_no_future_gap_or_incomplete_window(self):
        self.assertIsNone(m.execute([bar(0)], 0, 1, 98, 104, 2))
        self.assertIsNone(m.execute([bar(0), bar(2*m.STEP)], 0, 1, 98, 104, 2))

    def test_flat_market_cost_is_negative(self):
        r = m.execute([bar(0)], 0, 1, 98, 104, 1)
        self.assertEqual(r['reason'], 'TIME')
        self.assertAlmostEqual(r['netPct'], -.16, places=3)
        self.assertAlmostEqual(r['stressNetPct'], -.30, places=3)


if __name__ == '__main__':
    unittest.main()
