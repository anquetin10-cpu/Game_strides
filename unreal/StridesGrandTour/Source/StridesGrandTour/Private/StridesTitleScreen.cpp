#include "StridesTitleScreen.h"

#include "Blueprint/WidgetTree.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/Image.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Engine/Texture2D.h"
#include "Styling/CoreStyle.h"

namespace
{
// Jetons de couleur du web (styles.css :root).
const FLinearColor Ink = FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("0f0f0e")));       // --st-ink
const FLinearColor Text1 = FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("0a0a09")));     // --st-text
const FLinearColor Text2 = FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("46443e")));     // --st-text-2
const FLinearColor Text3 = FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("605d56")));     // --st-text-3
const FLinearColor Surface2 = FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("f7f4ed")));  // --st-surface-2
const FLinearColor Gold = FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("b8953a")));      // --st-gold
const FLinearColor Line2 = FLinearColor(0.0034f, 0.0034f, 0.0027f, 0.14f);                   // --st-line-2

FSlateFontInfo Font(const TCHAR* Face, float Px) { return FCoreStyle::GetDefaultFontStyle(Face, Px * 0.75f); }
}  // namespace

void UStridesTitleScreen::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	SetIsFocusable(true);
	Build();
}

void UStridesTitleScreen::Build()
{
	if (Root || !WidgetTree) return;
	Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("TitleRoot"));
	WidgetTree->RootWidget = Root;
	// .title-screen : dégradé horizontal rgba(239,234,224) 0,98 → 0,93 (40 %) → 0,5 (58 %) → 0 (76 %), monde visible à droite.
	ShadeTex = UTexture2D::CreateTransient(256, 1, PF_B8G8R8A8);
	if (ShadeTex)
	{
		ShadeTex->SRGB = true;
		FTexture2DMipMap& Mip = ShadeTex->GetPlatformData()->Mips[0];
		FColor* Px = static_cast<FColor*>(Mip.BulkData.Lock(LOCK_READ_WRITE));
		for (int32 I = 0; I < 256; ++I)
		{
			const float T = I / 255.f;
			const float A = T < .4f ? FMath::Lerp(.98f, .93f, T / .4f) : T < .58f ? FMath::Lerp(.93f, .5f, (T - .4f) / .18f) : T < .76f ? FMath::Lerp(.5f, 0.f, (T - .58f) / .18f) : 0.f;
			Px[I] = FColor(239, 234, 224, (uint8)FMath::RoundToInt(A * 255));
		}
		Mip.BulkData.Unlock();
		ShadeTex->UpdateResource();
	}
	Shade = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), TEXT("TitleShade"));
	if (ShadeTex) Shade->SetBrushFromTexture(ShadeTex);
	UCanvasPanelSlot* SS = Root->AddChildToCanvas(Shade);
	SS->SetAnchors(FAnchors(0, 0, 1, 1));
	SS->SetOffsets(FMargin(0));
	// Colonne de gauche : titre, sous-titre, mention de l'application, avertissement, menu.
	TitleCol = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("TitleCol"));
	UCanvasPanelSlot* CS = Root->AddChildToCanvas(TitleCol);
	CS->SetAnchors(FAnchors(0, .5f));
	CS->SetAlignment(FVector2D(0, .5f));
	CS->SetPosition(FVector2D(56, 0));
	CS->SetAutoSize(true);
	auto AddText = [this](UVerticalBox* Box, const FString& S, const FSlateFontInfo& F, const FLinearColor& C, float Top, float WrapW = 0) {
		UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
		T->SetText(FText::FromString(S));
		T->SetFont(F);
		T->SetColorAndOpacity(FSlateColor(C));
		if (WrapW > 0) { T->SetAutoWrapText(true); T->SetWrapTextAt(WrapW); }
		UVerticalBoxSlot* VS = Box->AddChildToVerticalBox(T);
		VS->SetPadding(FMargin(0, Top, 0, 0));
		return T;
	};
	// screens.js gameTitle(t('LE MONDE ÉQUESTRE EN MONDE OUVERT')) : CONFIG.title en police d'affichage, sous-titre mono.
	AddText(TitleCol, TEXT("EQUESTRIAN TOUR"), Font(TEXT("Bold"), 72), Text1, 0);
	AddText(TitleCol, TEXT("LE MONDE ÉQUESTRE EN MONDE OUVERT"), Font(TEXT("Regular"), 12), Text3, 12);
	// appMention : « Application intégrée » + logo Strides (nom écrit), texte.
	AddText(TitleCol, TEXT("APPLICATION INTÉGRÉE · STRIDES"), Font(TEXT("Bold"), 10), Text3, 16);
	AddText(TitleCol, TEXT("Avec l’application Strides intégrée au téléphone du personnage — missions et paiements fictifs dans le jeu."), Font(TEXT("Regular"), 11.5f), Text2, 5, 300);
	Notice = AddText(TitleCol, FString(), Font(TEXT("Regular"), 12), FLinearColor(.55f, .12f, .08f), 14, 320);
	Menu = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("TitleMenu"));
	UVerticalBoxSlot* MS = TitleCol->AddChildToVerticalBox(Menu);
	MS->SetPadding(FMargin(0, 24, 0, 0));
	// Pied de page (pointeur fin) : rappel du clavier du web.
	Foot = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("TitleFoot"));
	Foot->SetText(FText::FromString(TEXT("Clavier : ZQSD/WASD = galop (Ctrl trot, Alt pas) · Espace = saut · Maj = boost (grand galop) · E = action · P = téléphone")));
	Foot->SetFont(Font(TEXT("Regular"), 11.5f));
	Foot->SetColorAndOpacity(FSlateColor(Text3));
	Foot->SetAutoWrapText(true);
	Foot->SetWrapTextAt(560);
	UCanvasPanelSlot* FS = Root->AddChildToCanvas(Foot);
	FS->SetAnchors(FAnchors(0, 1));
	FS->SetAlignment(FVector2D(0, 1));
	FS->SetPosition(FVector2D(56, -22));
	FS->SetAutoSize(true);
	// Création du personnage (showSetup) : carte au centre.
	SetupCard = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("SetupCard"));
	SetupCard->SetBrush(FSlateRoundedBoxBrush(Surface2, 22.f, Line2, 1.f));
	SetupCard->SetPadding(FMargin(28, 24));
	UCanvasPanelSlot* CardS = Root->AddChildToCanvas(SetupCard);
	CardS->SetAnchors(FAnchors(.5f, .5f));
	CardS->SetAlignment(FVector2D(.5f, .5f));
	CardS->SetAutoSize(true);
	UVerticalBox* CardBox = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	SetupCard->SetContent(CardBox);
	AddText(CardBox, TEXT("TON PROFIL STRIDES · VERSION JEU"), Font(TEXT("Bold"), 10), Text3, 0);
	AddText(CardBox, TEXT("Qui monte en selle ?"), Font(TEXT("Bold"), 28), Text1, 4);
	AddText(CardBox, TEXT("Prénom"), Font(TEXT("Regular"), 13), Text2, 16);
	{
		UButton* B = MakeButton(TEXT("name"), Name, false);
		CardBox->AddChildToVerticalBox(B)->SetPadding(FMargin(0, 6, 0, 0));
		NameText = Labels.FindRef(TEXT("name"));
	}
	AddText(CardBox, TEXT("Personnage"), Font(TEXT("Regular"), 13), Text2, 14);
	UHorizontalBox* Seg = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
	CardBox->AddChildToVerticalBox(Seg)->SetPadding(FMargin(0, 6, 0, 0));
	for (const auto& [Id, L] : {TPair<FString, FString>(TEXT("avatar-f"), TEXT("Cavalière")), TPair<FString, FString>(TEXT("avatar-m"), TEXT("Cavalier"))})
	{
		UButton* B = MakeButton(Id, L, false);
		UHorizontalBoxSlot* HS = Seg->AddChildToHorizontalBox(B);
		HS->SetPadding(FMargin(0, 0, 8, 0));
		HS->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
	}
	CardBox->AddChildToVerticalBox(MakeButton(TEXT("start"), TEXT("C’est parti"), true))->SetPadding(FMargin(0, 20, 0, 0));
	Buttons[TEXT("name")]->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnName);
	Buttons[TEXT("avatar-f")]->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnAvatarF);
	Buttons[TEXT("avatar-m")]->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnAvatarM);
	Buttons[TEXT("start")]->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnStart);
}

UButton* UStridesTitleScreen::MakeButton(const FString& Id, const FString& Label, bool bPrimary)
{
	// Focus clavier gardé par l'écran (sélection et saisie du prénom) : les boutons ne le prennent pas (sinon Entrée
	// déclencherait le bouton deux fois : par Slate et par la commande du jeu).
	UButton* B = WidgetTree->ConstructWidget<UStridesTitleButton>(UStridesTitleButton::StaticClass(), FName(*(TEXT("Btn_") + Id)));
	UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
	T->SetText(FText::FromString(Label));
	T->SetFont(Font(bPrimary ? TEXT("Bold") : TEXT("Regular"), 15));
	B->SetContent(T);
	Buttons.Add(Id, B);
	Labels.Add(Id, T);
	Primary.Add(Id, bPrimary);
	return B;
}

void UStridesTitleScreen::Open(bool bInHasSave, const FString& Issue)
{
	Build();
	bHasSave = bInHasSave;
	IssueText = Issue;
	bSetup = false;
	bOpen = true;
	// Menu du titre (showTitle) : sauvegarde lisible → Continuer (principal), Nouvelle partie ; sinon Jouer (ou Nouvelle
	// partie si la sauvegarde est illisible).
	Menu->ClearChildren();
	for (const TCHAR* Id : {TEXT("continue"), TEXT("new"), TEXT("play")})
		if (Buttons.Contains(Id)) { Buttons.Remove(Id); Labels.Remove(Id); Primary.Remove(Id); }
	auto Add = [this](const TCHAR* Id, const TCHAR* L, bool bP) {
		UButton* B = MakeButton(Id, L, bP);
		USizeBox* SB = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass());
		SB->SetWidthOverride(300);
		SB->SetHeightOverride(48);
		SB->SetContent(B);
		Menu->AddChildToVerticalBox(SB)->SetPadding(FMargin(0, 0, 0, 10));
		return B;
	};
	if (bHasSave)
	{
		Add(TEXT("continue"), TEXT("Continuer"), true)->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnContinue);
		Add(TEXT("new"), TEXT("Nouvelle partie"), false)->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnNew);
	}
	else Add(TEXT("play"), Issue.IsEmpty() ? TEXT("Jouer") : TEXT("Nouvelle partie"), true)->OnClicked.AddDynamic(this, &UStridesTitleScreen::OnPlay);
	Notice->SetText(FText::FromString(Issue.IsEmpty() ? FString() : FString::Printf(TEXT("Sauvegarde non chargée — %s Une copie a été conservée ; rien n’a été écrasé. Restaurez une copie ou commencez une nouvelle partie."), *Issue)));
	Notice->SetVisibility(Issue.IsEmpty() ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
	ShowPage();
}

void UStridesTitleScreen::ShowPage()
{
	ItemIds.Reset();
	if (bSetup) ItemIds = {TEXT("name"), TEXT("avatar-f"), TEXT("avatar-m"), TEXT("start")};
	else if (bHasSave) ItemIds = {TEXT("continue"), TEXT("new")};
	else ItemIds = {TEXT("play")};
	// Principal choisi d'office (titre : premier bouton ; création : « C'est parti »).
	Sel = bSetup ? 3 : 0;
	TitleCol->SetVisibility(bSetup ? ESlateVisibility::Collapsed : ESlateVisibility::SelfHitTestInvisible);
	Foot->SetVisibility(bSetup ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
	SetupCard->SetVisibility(bSetup ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	Refresh();
}

void UStridesTitleScreen::Refresh()
{
	for (const auto& [Id, B] : Buttons)
	{
		if (!B) continue;
		const bool bP = Primary.FindRef(Id);
		const bool bSel = SelectedId() == Id;
		const bool bOn = (Id == TEXT("avatar-f") && Avatar == TEXT("f")) || (Id == TEXT("avatar-m") && Avatar == TEXT("m"));
		// .btn.primary : encre, texte blanc ; .btn (titre) : surface 90 %, bordure ; segment choisi (.seg .on) : encre.
		const FLinearColor Fill = bP || bOn ? Ink : FLinearColor(Surface2.R, Surface2.G, Surface2.B, .9f);
		const FLinearColor Edge = bSel ? Gold : Line2;
		FButtonStyle St = B->GetStyle();
		St.SetNormal(FSlateRoundedBoxBrush(Fill, 14.f, Edge, bSel ? 3.f : 1.f));
		St.SetHovered(FSlateRoundedBoxBrush(Fill, 14.f, Gold, 2.f));
		St.SetPressed(FSlateRoundedBoxBrush(Gold, 14.f, Gold, 2.f));
		St.SetNormalPadding(FMargin(18, 12));
		St.SetPressedPadding(FMargin(18, 12));
		B->SetStyle(St);
		if (UTextBlock* T = Labels.FindRef(Id)) T->SetColorAndOpacity(FSlateColor(bP || bOn ? FLinearColor::White : Text1));
	}
	if (NameText) NameText->SetText(FText::FromString(Name + (NameFieldSelected() ? TEXT("|") : TEXT(""))));
}

void UStridesTitleScreen::MoveSelection(int32 Dir)
{
	if (ItemIds.Num() == 0) return;
	Sel = (Sel + Dir + ItemIds.Num()) % ItemIds.Num();
	Refresh();
}

bool UStridesTitleScreen::PressSelected() { return Press(SelectedId()); }

bool UStridesTitleScreen::Press(const FString& Id)
{
	if (!bOpen || !ItemIds.Contains(Id)) return false;
	Sel = ItemIds.IndexOfByKey(Id);
	if (Id == TEXT("continue")) { bOpen = false; OnChoice.ExecuteIfBound(false, Name, Avatar); return true; }
	if (Id == TEXT("new") || Id == TEXT("play")) { bSetup = true; ShowPage(); return true; }
	if (Id == TEXT("name")) { Refresh(); return true; }
	if (Id == TEXT("avatar-f") || Id == TEXT("avatar-m")) { Avatar = Id == TEXT("avatar-f") ? TEXT("f") : TEXT("m"); Refresh(); return true; }
	if (Id == TEXT("start"))
	{
		// showSetup : prénom coupé à 16 caractères, « Alex » s'il est vide.
		FString N = Name.TrimStartAndEnd().Left(16);
		if (N.IsEmpty()) N = TEXT("Alex");
		Name = N;
		bOpen = false;
		OnChoice.ExecuteIfBound(true, Name, Avatar);
		return true;
	}
	return false;
}

void UStridesTitleScreen::TypeChar(TCHAR C)
{
	if (!NameFieldSelected() || C < 32 || Name.Len() >= 16) return;
	Name.AppendChar(C);
	Refresh();
}

void UStridesTitleScreen::Backspace()
{
	if (!NameFieldSelected() || Name.IsEmpty()) return;
	Name.LeftChopInline(1);
	Refresh();
}

FReply UStridesTitleScreen::NativeOnKeyChar(const FGeometry& G, const FCharacterEvent& E)
{
	if (NameFieldSelected()) { TypeChar(E.GetCharacter()); return FReply::Handled(); }
	return Super::NativeOnKeyChar(G, E);
}

TArray<FString> UStridesTitleScreen::Describe() const
{
	TArray<FString> Out;
	Out.Add(FString::Printf(TEXT("page=%s"), *Page()));
	for (const FString& Id : ItemIds)
		if (const UTextBlock* T = Labels.FindRef(Id)) Out.Add(FString::Printf(TEXT("%s%s=%s"), Id == SelectedId() ? TEXT("*") : TEXT(""), *Id, *T->GetText().ToString()));
	if (Notice && !Notice->GetText().IsEmpty()) Out.Add(TEXT("notice=") + Notice->GetText().ToString());
	return Out;
}

void UStridesTitleScreen::OnContinue() { Press(TEXT("continue")); }
void UStridesTitleScreen::OnNew() { Press(TEXT("new")); }
void UStridesTitleScreen::OnPlay() { Press(TEXT("play")); }
void UStridesTitleScreen::OnName() { Press(TEXT("name")); }
void UStridesTitleScreen::OnAvatarF() { Press(TEXT("avatar-f")); }
void UStridesTitleScreen::OnAvatarM() { Press(TEXT("avatar-m")); }
void UStridesTitleScreen::OnStart() { Press(TEXT("start")); }
