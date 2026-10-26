using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;

public sealed partial class Overlay
{
    Popup preferencesMenu;
    string menuState = "";
    readonly Dictionary<string,BitmapSource> menuPortraits = new Dictionary<string,BitmapSource>();

    void CloseMenu() { if(preferencesMenu!=null) preferencesMenu.IsOpen=false; }

    void ShowMenu()
    {
        if(preferencesMenu!=null && preferencesMenu.IsOpen) { CloseMenu(); return; }
        preferencesMenu=new Popup {
            PlacementTarget=characterButton, Placement=PlacementMode.Top,
            HorizontalOffset=characterButton.ActualWidth-376, VerticalOffset=-4,
            AllowsTransparency=true, StaysOpen=false, PopupAnimation=PopupAnimation.Fade
        };
        menuState=MenuState();
        preferencesMenu.Child=BuildMenu();
        preferencesMenu.Opened+=delegate { MenuButtons(preferencesMenu.Child).First().Focus(); };
        preferencesMenu.IsOpen=true;
    }

    string MenuState()
    {
        return json.Serialize(new {id=Str(companion,"id"),mode=Str(companion,"mode"),
            scale=Str(companion,"scale"),rotationSeconds=Str(companion,"rotationSeconds"),
            bubbleHidden=bubbleHidden,favorites=MenuFavorites()});
    }

    void RefreshMenu()
    {
        if(preferencesMenu==null || !preferencesMenu.IsOpen || menuState==MenuState()) return;
        var focused=Keyboard.FocusedElement as DependencyObject;
        string name=focused==null ? "" : AutomationProperties.GetName(focused);
        menuState=MenuState();
        preferencesMenu.Child=BuildMenu();
        var next=MenuButtons(preferencesMenu.Child).FirstOrDefault(button=>AutomationProperties.GetName(button)==name);
        if(next!=null) next.Focus();
    }

    List<string> MenuFavorites()
    {
        object raw;
        return companion.TryGetValue("favorites",out raw) ? ((IEnumerable)raw).Cast<object>().Select(Convert.ToString).ToList() : new List<string>();
    }

    Image MenuPortrait(string id, double size)
    {
        if(!menuPortraits.ContainsKey(id)) {
            var bitmap=new BitmapImage();bitmap.BeginInit();bitmap.CacheOption=BitmapCacheOption.OnLoad;
            bitmap.UriSource=new Uri(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","sprites",id+".png"));
            bitmap.EndInit();bitmap.Freeze();
            var portrait=new CroppedBitmap(bitmap,new Int32Rect(0,0,192,208));portrait.Freeze();menuPortraits[id]=portrait;
        }
        return new Image {Source=menuPortraits[id],Width=size,Height=size,Stretch=Stretch.Uniform};
    }

    Button MenuButton(string title, string name, bool selected, Action action)
    {
        var button=new Button {
            Content=title,FontSize=11,FontFamily=FontFamily,FontWeight=selected ? FontWeights.SemiBold : FontWeights.Normal,
            Foreground=Color(selected ? T("accent") : T("muted")),Background=Color(selected ? T("soft") : "#F5F6FA"),
            BorderBrush=Color(selected ? T("border") : "#00FFFFFF"),BorderThickness=new Thickness(1),
            Padding=new Thickness(8,5,8,5),MinHeight=30,Margin=new Thickness(2),Cursor=Cursors.Hand,
            HorizontalContentAlignment=HorizontalAlignment.Center,Template=MenuButtonTemplate()
        };
        AutomationProperties.SetName(button,name);
        AutomationProperties.SetHelpText(button,selected ? "已选中" : "");
        button.Click+=delegate { action(); };
        return button;
    }

    Button MenuPreference(string title,string name,object patch,bool selected)
    {
        return MenuButton(title,name,selected,delegate { Emit(new {type="preferences",patch=patch}); });
    }

    FrameworkElement BuildMenu()
    {
        var body=new StackPanel {Width=318};
        var header=new DockPanel {Margin=new Thickness(0,0,0,8)};
        var dismiss=MenuButton("×","收起设置",false,CloseMenu);dismiss.Width=28;dismiss.Height=28;
        dismiss.Padding=new Thickness(0);dismiss.FontSize=20;dismiss.Background=Brushes.Transparent;
        DockPanel.SetDock(dismiss,Dock.Right);header.Children.Add(dismiss);
        if(spriteId!="") {
            var portrait=new Border {Child=MenuPortrait(spriteId,40),CornerRadius=new CornerRadius(14),Background=Color(T("soft")),Margin=new Thickness(0,0,12,0)};
            DockPanel.SetDock(portrait,Dock.Left);header.Children.Add(portrait);
        }
        var identity=new StackPanel {VerticalAlignment=VerticalAlignment.Center};
        var title=Text("AI 娘",16,T("ink"));title.FontWeight=FontWeights.SemiBold;identity.Children.Add(title);
        identity.Children.Add(Text(Str(companion,"label"),10,T("muted")));header.Children.Add(identity);body.Children.Add(header);
        body.Children.Add(MenuHeading("选择角色"));
        object raw;
        if(companion.TryGetValue("options",out raw)) {
            var options=((IEnumerable)raw).Cast<object>().OfType<Dictionary<string,object>>();
            foreach(var group in options.GroupBy(option=>Str(option,"id").Split('-')[0])) {
                var choices=group.ToArray();bool current=choices.Any(option=>Str(option,"id")==spriteId);
                var row=new Grid {Margin=new Thickness(0,1,0,1)};
                row.ColumnDefinitions.Add(new ColumnDefinition {Width=new GridLength(42)});
                row.ColumnDefinitions.Add(new ColumnDefinition {Width=new GridLength(1,GridUnitType.Star)});
                row.ColumnDefinitions.Add(new ColumnDefinition {Width=new GridLength(55)});
                row.ColumnDefinitions.Add(new ColumnDefinition {Width=new GridLength(55)});
                var icon=MenuPortrait(group.Key+"-chibi",32);row.Children.Add(icon);
                var label=Text(Str(choices[0],"label").Split('·')[0].Trim(),11,T("ink"));
                label.VerticalAlignment=VerticalAlignment.Center;label.FontWeight=current ? FontWeights.SemiBold : FontWeights.Normal;
                Grid.SetColumn(label,1);row.Children.Add(label);
                for(int i=0;i<choices.Length;i++) {
                    var option=choices[i];var id=Str(option,"id");
                    var button=MenuPreference(id.EndsWith("chibi") ? "Q 版" : "常态",Str(option,"label"),new {id=id,mode="fixed"},id==spriteId);
                    button.VerticalAlignment=VerticalAlignment.Center;Grid.SetColumn(button,i+2);row.Children.Add(button);
                }
                body.Children.Add(row);
            }
        }
        var favoriteRow=new DockPanel {Margin=new Thickness(0,8,0,3)};
        var favorites=MenuFavorites();bool favorite=favorites.Contains(spriteId);
        if(favorite) favorites.Remove(spriteId);else favorites.Add(spriteId);
        var star=MenuPreference(favorite ? "★ 已收藏" : "☆ 收藏",favorite ? "取消收藏当前形态" : "收藏当前形态",new {favorites=favorites.ToArray()},favorite);
        star.MinHeight=24;star.Padding=new Thickness(7,2,7,2);star.Background=Brushes.Transparent;
        DockPanel.SetDock(star,Dock.Right);favoriteRow.Children.Add(star);
        var modeHeading=MenuHeading("陪伴方式");modeHeading.VerticalAlignment=VerticalAlignment.Center;favoriteRow.Children.Add(modeHeading);body.Children.Add(favoriteRow);
        var modes=new UniformGrid {Columns=4};
        var modeIds=new[]{"fixed","sequential","favorites","random"};var modeLabels=new[]{"固定","顺序","收藏","随机"};
        for(int i=0;i<modeIds.Length;i++) modes.Children.Add(MenuPreference(modeLabels[i],modeLabels[i]+"模式",new {mode=modeIds[i]},Str(companion,"mode")==modeIds[i]));
        body.Children.Add(modes);
        var intervalTitle=MenuHeading("切换间隔 · "+Str(companion,"rotationSeconds")+" 秒");intervalTitle.Margin=new Thickness(0,10,0,4);body.Children.Add(intervalTitle);
        var intervals=new UniformGrid {Columns=6};
        foreach(var seconds in new[]{5,10,30,60,300,900}) {
            var button=MenuPreference(seconds<60 ? seconds+" 秒" : seconds/60+" 分", "轮换间隔 "+seconds+" 秒",new {rotationSeconds=seconds},Str(companion,"rotationSeconds")==seconds.ToString());
            button.Padding=new Thickness(2,4,2,4);intervals.Children.Add(button);
        }
        body.Children.Add(intervals);
        var sizeRow=new DockPanel {Margin=new Thickness(0,10,0,0)};
        var sizeLabel=MenuHeading("角色大小");sizeLabel.Width=64;sizeLabel.VerticalAlignment=VerticalAlignment.Center;DockPanel.SetDock(sizeLabel,Dock.Left);sizeRow.Children.Add(sizeLabel);
        var sizes=new UniformGrid {Columns=4};
        foreach(var scale in new[]{0.75,1.0,1.25,1.5}) sizes.Children.Add(MenuPreference((int)(scale*100)+"%","角色大小 "+(int)(scale*100)+"%",new {scale=scale},companion.TryGetValue("scale",out raw) && Convert.ToDouble(raw)==scale));
        sizeRow.Children.Add(sizes);body.Children.Add(sizeRow);
        body.Children.Add(new Border {Height=1,Background=Color(T("border")),Opacity=0.5,Margin=new Thickness(0,14,0,10)});
        var actions=new UniformGrid {Columns=2};
        actions.Children.Add(MenuPreference(bubbleHidden ? "○  任务气泡已隐藏" : "✓  显示任务气泡",bubbleHidden ? "显示任务气泡" : "隐藏任务气泡",new {bubbleHidden=!bubbleHidden},!bubbleHidden));
        actions.Children.Add(MenuButton("↘  重置位置","恢复到主屏右下角",false,delegate {
            CloseMenu();Left=SystemParameters.WorkArea.Right-Width-28;Top=SystemParameters.WorkArea.Bottom-ActualHeight-30;Clamp();SavePosition();
        }));body.Children.Add(actions);
        var footer=new DockPanel {Margin=new Thickness(0,9,0,0)};
        var close=MenuButton("关闭桌宠","关闭桌宠",false,delegate {CloseMenu();Close();});
        close.Foreground=Color("#9A6570");close.Background=Brushes.Transparent;close.MinHeight=24;close.Padding=new Thickness(8,2,8,2);
        DockPanel.SetDock(close,Dock.Right);footer.Children.Add(close);
        var hint=Text("拖动角色可移动位置",10,T("muted"));hint.VerticalAlignment=VerticalAlignment.Center;footer.Children.Add(hint);body.Children.Add(footer);
        // Popup constrains its size to the available screen. Fit the whole card
        // inside that space so every action stays visible without scrolling.
        var fitted=new Viewbox {Child=body,Stretch=Stretch.Uniform,StretchDirection=StretchDirection.DownOnly};
        var card=new Border {Width=352,Padding=new Thickness(16),Margin=new Thickness(12),CornerRadius=new CornerRadius(20),
            MaxHeight=Math.Max(260,MaxHeight-32),BorderThickness=new Thickness(1),BorderBrush=Color(T("border")),Background=Color(T("surface")),Child=fitted,
            Effect=new DropShadowEffect {BlurRadius=20,ShadowDepth=4,Opacity=0.16,Color=(System.Windows.Media.Color)ColorConverter.ConvertFromString("#293653")}};
        TextOptions.SetTextFormattingMode(card,TextFormattingMode.Display);
        KeyboardNavigation.SetTabNavigation(card,KeyboardNavigationMode.Cycle);
        card.PreviewKeyDown+=delegate(object sender,KeyEventArgs e) {if(e.Key==Key.Escape) {CloseMenu();e.Handled=true;}};
        return card;
    }

    TextBlock MenuHeading(string title)
    {
        var label=Text(title,10,T("muted"));label.Margin=new Thickness(0,0,0,4);return label;
    }

    static IEnumerable<Button> MenuButtons(DependencyObject root)
    {
        if(root is Button) yield return (Button)root;
        for(int i=0;i<VisualTreeHelper.GetChildrenCount(root);i++)
            foreach(var button in MenuButtons(VisualTreeHelper.GetChild(root,i))) yield return button;
    }

    static ControlTemplate MenuButtonTemplate()
    {
        var border=new FrameworkElementFactory(typeof(Border));border.Name="plate";
        border.SetValue(Border.CornerRadiusProperty,new CornerRadius(9));
        border.SetValue(Border.BackgroundProperty,new TemplateBindingExtension(Control.BackgroundProperty));
        border.SetValue(Border.BorderBrushProperty,new TemplateBindingExtension(Control.BorderBrushProperty));
        border.SetValue(Border.BorderThicknessProperty,new TemplateBindingExtension(Control.BorderThicknessProperty));
        border.SetValue(Border.PaddingProperty,new TemplateBindingExtension(Control.PaddingProperty));
        var content=new FrameworkElementFactory(typeof(ContentPresenter));
        content.SetValue(ContentPresenter.HorizontalAlignmentProperty,HorizontalAlignment.Center);
        content.SetValue(ContentPresenter.VerticalAlignmentProperty,VerticalAlignment.Center);border.AppendChild(content);
        var template=new ControlTemplate(typeof(Button)) {VisualTree=border};
        var hover=new Trigger {Property=UIElement.IsMouseOverProperty,Value=true};
        hover.Setters.Add(new Setter(UIElement.OpacityProperty,0.75));template.Triggers.Add(hover);
        var focus=new Trigger {Property=UIElement.IsKeyboardFocusedProperty,Value=true};
        focus.Setters.Add(new Setter(Border.BorderBrushProperty,Color("#8799D1"),"plate"));template.Triggers.Add(focus);
        return template;
    }
}
