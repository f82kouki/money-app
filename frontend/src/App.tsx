import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import GroupSetup from "./pages/GroupSetup";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Settings from "./pages/Settings";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { authed } = useAuth();
  if (authed === null) {
    return <div className="p-8 text-center text-slate-500">読み込み中…</div>;
  }
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { authed } = useAuth();

  return (
    <div className="mx-auto min-h-full max-w-md bg-[#FFF5F8]">
      <Routes>
        <Route
          path="/login"
          element={authed ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={authed ? <Navigate to="/" replace /> : <Register />}
        />
        <Route
          path="/setup"
          element={
            <RequireAuth>
              <GroupSetup />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
