interface Props {
  classes?: string;
}

export function HrDivider(props: Props) {
  const { classes } = props;
  return <hr className={`h-px w-full border-none bg-gray-300 ${classes}`} />;
}
