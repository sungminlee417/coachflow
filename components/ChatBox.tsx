"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client"; // supabase client

type ChatBoxProps = {
  clientId: string;
  open: boolean;
};
// get Current user
// I need supabase client
export default function ChatBox({ clientId, open }: ChatBoxProps) {
  const supabase = createClient();
  // state - some that persist (value that persis on component render)
  // component -> fragment of jsx/tsx logic for it
  const [conversationId, setConversationId] = useState<string | null>(null);
  console.log("conversationId:", conversationId);
  // built in react hook that runs callback on mount
  useEffect(() => {
    // run on component mount and/or dependency change
    const setupConversation = async () => {
      // get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // find existing conversation
      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("coach_id", user.id)
        .eq("client_id", clientId)
        .maybeSingle(); // expects only 1 result and returns null if none

      let conversationId: string;

      // create if not exists
      if (existingConversation) {
        conversationId = existingConversation.id;
      } else {
        const { data: newConversation } = await supabase
          .from("conversations")
          .insert({
            coach_id: user.id,
            client_id: clientId,
          })
          .select()
          .single();

        conversationId = newConversation.id;
      }
      // save to state
      // renders (unmounted) state will go away if we unmount
      setConversationId(conversationId);
    };
    setupConversation();
  }, [clientId]); // dependency array (if this change, useEffect will run again)
  return open ? <div>ChatBox</div> : null;
}
