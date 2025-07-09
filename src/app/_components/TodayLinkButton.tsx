import { Button } from "@mantine/core";
import Link from "next/link";

export function TodayLinkButton() {
  return (
    <Button
      component={Link}
      href="/today"
      variant="filled"
      color="dark"
    >
      Today 🚀
    </Button>
  );
}