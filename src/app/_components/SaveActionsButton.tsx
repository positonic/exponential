import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { Button } from "@mantine/core";

export default function SaveActionsButton() {
  const createSetupsMutation = () => console.log("save actions");
  //   const createSetupsMutation = api.transcription.saveActionsFromTranscription.useMutation({
  //   onSuccess: () => {
  //     notifications.show({
  //       title: 'Success',
  //       message: 'Setups created successfully',
  //       color: 'green',
  //     });
  //     router.push('/setups');
  //   },
  //   onError: (error) => {
  //     notifications.show({
  //       title: 'Error',
  //       message: error.message,
  //       color: 'red',
  //     });
  //   },
  // });
  return (
    <Button
      
    >
      Save Actions
    </Button>
    // <Button
    //   loading={createSetupsMutation.isPending}
    //   onClick={() =>
    //     createSetupsMutation.mutate({ transcriptionId: session.id })
    //   }
    // >
    //   Save Actions
    // </Button>
  );
}
