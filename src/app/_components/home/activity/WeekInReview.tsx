'use client';

import { Button, Group, Skeleton, Tooltip } from '@mantine/core';
import { IconChartBar, IconSparkles } from '@tabler/icons-react';

/**
 * Skeleton placeholder for the Week-in-Review card. Real data wires in
 * slice 6 — for T2 we render layout chrome plus skeletons so the home page
 * shows the full shape immediately.
 *
 * The two CTAs are wrapped in `Tooltip` and disabled to telegraph that the
 * surface is still coming.
 */
export function WeekInReview() {
  return (
    <section className="wsa-card wsa-week">
      <div>
        <div className="wsa-card__head">
          <h2 className="wsa-card__title">
            <IconChartBar size={14} stroke={1.8} />
            Week in review
          </h2>
          <span className="wsa-card__caption">Coming soon</span>
        </div>
        <Skeleton height={48} width="60%" />
        <Skeleton height={60} mt="md" />
        <Skeleton height={16} mt="md" width="80%" />
        <Skeleton height={16} mt={6} width="72%" />

        <Group className="wsa-week__cta-row">
          <Tooltip label="Coming soon" withArrow>
            <Button
              size="sm"
              variant="filled"
              color="brand"
              data-disabled
              onClick={(event) => event.preventDefault()}
            >
              Start weekly review
            </Button>
          </Tooltip>
          <Tooltip label="Coming soon" withArrow>
            <Button
              size="sm"
              variant="default"
              leftSection={<IconSparkles size={14} stroke={1.8} />}
              data-disabled
              onClick={(event) => event.preventDefault()}
            >
              Ask agent to summarize
            </Button>
          </Tooltip>
        </Group>
      </div>

      <div>
        <Skeleton height={120} />
        <span className="wsa-card__caption" style={{ display: 'block', marginTop: 10 }}>
          Daily completion sparkline lands in slice 6.
        </span>
      </div>
    </section>
  );
}
