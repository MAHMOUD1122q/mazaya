import * as Yup from "yup";

export const registerSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  phone: Yup.string()
    .required("Phone is required")
    .matches(/^[0-9]+$/, "Phone must contain only digits"),
  location: Yup.object({
    lat: Yup.number()
      .typeError("Latitude must be a number")
       .required("location  lat is required")
      .min(-90, "Latitude must be >= -90")
      .max(90, "Latitude must be <= 90")
      .nullable(),
    lng: Yup.number()
      .typeError("Longitude must be a number")
    .required("location lng  is required")
      .min(-180, "Longitude must be >= -180")
      .max(180, "Longitude must be <= 180")
      .nullable(),
  }),
});

export const loginSchema = Yup.object({
  phone: Yup.string().required("Phone is required"),
});
