import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import PayslipDetail from "./components/PayslipDetail.jsx";
import sample from "./_sample.json";
ReactDOM.createRoot(document.getElementById("root")).render(<BrowserRouter><div style={{padding: 12}}><PayslipDetail summary={sample} showDailyAttendance={false} /></div></BrowserRouter>);
