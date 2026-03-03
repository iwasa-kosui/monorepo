import { Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Post } from "./pages/Post";
import { Talks } from "./pages/Talks";
import { Talk } from "./pages/Talk";
import { About } from "./pages/About";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/posts/:slug" element={<Post />} />
        <Route path="/talks" element={<Talks />} />
        <Route path="/talks/:slug" element={<Talk />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Layout>
  );
}
