import React from "react";
import { Admin, Resource, ListGuesser, EditGuesser, ShowGuesser, CreateGuesser } from "react-admin";
import dataProvider from "./dataProvider";

export default function AdminApp() {
  return (
    <Admin basename="/cms" dataProvider={dataProvider}>
      <Resource name="blog-posts" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} create={CreateGuesser} />
      <Resource name="lessons" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} create={CreateGuesser} />
      <Resource name="home" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} create={CreateGuesser} />
      <Resource name="newsletters" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} create={CreateGuesser} />
      <Resource name="contacts" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} create={CreateGuesser} />
    </Admin>
  );
}
