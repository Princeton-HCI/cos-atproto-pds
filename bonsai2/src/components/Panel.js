import { H } from "./Typography";

const Panel = ({ title, children }) => {
  return (
    <div className="panel">
      <H
        className="panel-title"
        style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 12px" }}
      >
        {title}
      </H>
      {children}
    </div>
  );
};

export default Panel;
