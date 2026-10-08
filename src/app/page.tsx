import { redirect } from "next/navigation";

// Operations is the default seat; a customer persona is sent on to the portal by its layout.
export default function Home() {
  redirect("/ops");
}
