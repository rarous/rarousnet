(ns rarousnet.home.handler
  (:require [compojure.core :refer [defroutes GET ANY]]
            [net.cgrand.enlive-html :refer [deftemplate]]
            [ring.util.response :refer [charset]]))

(deftemplate home-template "home/index.html" [])
(deftemplate webdesign-template "home/webdesign.html" [])
(deftemplate photos-template "home/photos.html" [])

(defn view [template]
    (apply str (template)))

(defn render [template]
  (-> {:status 200
       :headers {"Content-Type" "text/html"}
       :body (view template)}
      (charset "UTF-8")))

(defn moved-permanently [location]
  {:status 301
   :headers {"Location" location}})

(defn home [] (render home-template))
(defn webdesign [] (render webdesign-template))
(defn photos [] (render photos-template))
(defn redirect-home [] (moved-permanently "/"))
(defn redirect-reference [] (moved-permanently "/webdesign/"))
(defn redirect-photos [] (moved-permanently "/photos/"))
(defn redirect-texy [] (moved-permanently "http://texy-rarous.rhcloud.com/ws/endpoint.php"))

(defroutes routes
  (GET "/" [] (home))
  (GET "/webdesign/" [] (webdesign))
  (GET "/photos/" [] (photos))

  (GET "/default.aspx" [] (redirect-home))
  (GET "/about.aspx" [] (redirect-home))
  (GET "/stranky.aspx" [] (redirect-home))
  (GET "/odkazy.aspx" [] (redirect-home))
  (GET "/skola.aspx" [] (redirect-home))
  (GET "/Default.aspx" [] (redirect-home))
  (GET "/reference.aspx" [] (redirect-reference))
  (GET "/weblog/reference.aspx" [] (redirect-reference))
  (GET "/weblog/projekty.aspx" [] (redirect-reference))
  (GET "/webdesign" [] (redirect-reference))
  (GET "/galerie.aspx" [] (redirect-photos))
  (GET "/Galerie.aspx" [] (redirect-photos))
  (GET "/galerie/:url" [] (redirect-photos))
  (GET "/photos" [] (redirect-photos))
  (ANY "/texy-ws/endpoint.php" [] (redirect-texy)))
